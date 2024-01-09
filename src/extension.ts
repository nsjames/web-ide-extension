import * as vscode from 'vscode';
import * as AdmZip from 'adm-zip';
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import Project from './models/Project.model';
import ProjectFile from './models/ProjectFile.model';
import ApiService from './services/Api.service';
const { createHash } = require('crypto');

const API_URL = 'https://api.ide.eosnetwork.com';
const WS_API_URL = "wss://api.ide.eosnetwork.com/websocket";

let socket;



export function activate(context: vscode.ExtensionContext) {


	const disposable = vscode.commands.registerCommand('eos-code-compiler.compile', () => {
		compileEOSCode();
	});
	context.subscriptions.push(disposable);
}

const getRoot = (): string => {
	let root = "";
	if(vscode.workspace.workspaceFolders !== undefined) {
		return vscode.workspace.workspaceFolders[0].uri.path;
	} else {
		vscode.window.showErrorMessage("No workspace folder opened.");
	}

	return root;
}

const getFileContent = async (file: vscode.Uri): Promise<string> => {
	return await vscode.workspace.openTextDocument(file).then(doc => doc.getText());
}

const sha256 = (data: string): string => {
	return createHash('sha256').update(data).digest('hex');
}

const createProject = async () => {
	const projectId:string = (() => {
		const id = sha256((getRoot() + '-' + vscode.workspace.name).replace(/\//g, '-').replace(/\s/g, '-').toLowerCase()).split('');
		let formattedId = 'contract-'
		for(let i = 0; i < 5; i++) {
			if(i === 0 || i === 4){
				for(let y = 0; y < 8; y++){
					formattedId += id.shift();
				}
			} else {
				for(let y = 0; y < 4; y++){
					formattedId += id.shift();
				}
			}
			if(i < 4) formattedId += '-';
		}
		return formattedId;		
	})();
	
	const rawFiles = (await vscode.workspace.findFiles('**/*.*')).filter(file => {
		const {ext} = path.parse(file.path);
		return ['.cpp', '.hpp', '.h'].includes(ext);
	});

	const projectFiles = await Promise.all(rawFiles.map(async file => {
		const name = file.path.split('/').pop() || 'Error getting name';
		const fileContent = getFileContent(file);
		return new ProjectFile(name, file.path.replace(getRoot() + '/' + name, ''), await fileContent);
	}));

	const name = vscode.workspace.name || 'Untitled';
	return new Project(projectId, name, projectFiles, projectFiles[0].id);
}

async function compileEOSCode() {
	vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		cancellable: false,
		title: 'Building EOS Code'
	}, async progress => {
		progress.report({  increment: 0 });
		await ApiService.setup();

		const project = await createProject();

		vscode.window.showInformationMessage(`Compiling ${project.files.length} files\n`);

		const built = await ApiService.build(project).catch(err => {
			console.log('err', err);
			return null;
		});
		if(built){
			const {wasm, abi} = built;
			const buildFolder = vscode.Uri.file(getRoot() + '/build');
			try { await vscode.workspace.fs.delete(buildFolder, { recursive: true, useTrash: false }); } catch (error) {}
			await vscode.workspace.fs.createDirectory(buildFolder);
			const downloadedWasm:any = await axios.get(wasm, { responseType: 'arraybuffer' }).then(x => x.data).catch((err:any) => console.log('err', err));
			const downloadedAbi:any = await axios.get(abi, { responseType: 'arraybuffer' }).then(x => x.data).catch((err:any) => console.log('err', err));

		
			const wasmFileUri = vscode.Uri.file(buildFolder.fsPath + '/contract.wasm');
			const abiFileUri = vscode.Uri.file(buildFolder.fsPath + '/contract.abi');

			await vscode.workspace.fs.writeFile(wasmFileUri, Buffer.from(downloadedWasm));
			await vscode.workspace.fs.writeFile(abiFileUri, Buffer.from(downloadedAbi));

			vscode.window.showInformationMessage('Finished building, WASM and ABI available in build folder.');
		}


	
		progress.report({ increment: 100 });
	});
}

export function deactivate() {}
