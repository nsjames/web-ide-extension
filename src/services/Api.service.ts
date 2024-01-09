const WebSocket = require('ws');
import Project from "../models/Project.model";
import ConsoleService from "./Console.service";

const API_URL = 'https://api.ide.eosnetwork.com';
const WS_URL = "wss://api.ide.eosnetwork.com/websocket";
// const WS_URL:string = import.meta.env.VITE_API_WS_URL.replace(/\/$/, "");
// const API_URL:string = import.meta.env.VITE_API_HTTP_URL.replace(/\/$/, "");


let socket:any;

let lastZip:any = null;
let lastWasm:any = null;
let lastAbi:any = null;

let buildResolver:any = null;

export default class ApiService {

    static setup(){
        if(socket) {
            socket.close();
            socket = null;
        }
        return new Promise((resolve, reject) => {
            socket = new WebSocket(WS_URL);

            socket.addEventListener('open', () => {
                resolve(true);
            });

            socket.addEventListener('message', (event) => {

                let json;
                try {
                    json = JSON.parse(event.data);
                } catch (error) {
                    return console.error('Error parsing message:', error);
                }

                if(json.type === "build-status"){
                    lastZip = null;
                    lastWasm = null;
                    lastAbi = null;

                    if(json.data.success){
                        ConsoleService.prepend(`Build completed successfully!`);
                        lastZip = `${API_URL}/v1/download/zip/${json.data.data}`;
                        lastWasm = `${API_URL}/v1/download/wasm/${json.data.data}`;
                        lastAbi = `${API_URL}/v1/download/abi/${json.data.data}`;
                        ConsoleService.prepend(`<a class="text-fontHighlight" style="text-decoration: underline;" href="${lastZip}">DOWNLOAD ZIP</a> | <a class="text-fontHighlight" style="text-decoration: underline;" href="${lastWasm}">DOWNLOAD WASM</a> | <a class="text-fontHighlight" style="text-decoration: underline;" href="${lastAbi}">DOWNLOAD ABI</a>`);
                        ConsoleService.prepend('');

                        // using vscode extension download file from server to local 
                        // vscode.window.showInformationMessage('Downloaded zip file');


                        if(buildResolver){
                            buildResolver({wasm:lastWasm, abi:lastAbi});
                            buildResolver = null;
                        }

                    } else {
                        ConsoleService.prepend(`Build failed!`);
                        ConsoleService.prepend(`Error: ${json.data.data}`);
                        ConsoleService.prepend('');
                    }

                    return;
                }

                if(json.type === "deploy-status"){
                    if(json.data.success){
                        // contractDeployedTo.set(json.data.data.account);
                        ConsoleService.prepend(`Deployed successfully!`);
                        // availableInteractions.set(json.data.data.actions);
                        // availableTables.set(json.data.data.tables);
                        ConsoleService.prepend('');
                    } else {
                        ConsoleService.prepend(`Deploy failed!`);
                        ConsoleService.prepend(`Error: ${JSON.stringify(json.data.data)}`);
                        ConsoleService.prepend('');
                    }

                    return;
                }

                // if(json.type === "table-result"){
                //     if(json.data.success){
                //         ConsoleService.prepend(JSON.stringify(json.data.data, null, 4));
                //         ConsoleService.prepend('');
                //     } else {
                //         ConsoleService.prepend(`Table result failed!`);
                //         ConsoleService.prepend(`Error: ${JSON.stringify(json.data.data)}`);
                //         ConsoleService.prepend('');
                //     }
                //     return;
                // }

                // if(json.type === "interaction-status"){
                //     if(json.data.success){
                //         ConsoleService.prepend(`Interaction success!`);
                //         ConsoleService.prepend(`<details><summary>Transaction: <a class="text-fontHighlight" style="color:text-decoration: underline;" href="https://jungle4.eosq.eosnation.io/tx/${json.data.data.response.transaction_id}" target="_blank">See transaction on explorer</a></summary><pre>${JSON.stringify(json.data.data, null, 4)}</pre></details>`);
                //         ConsoleService.prepend('');
                //     } else {
                //         ConsoleService.prepend(`Interaction failed!`);
                //         ConsoleService.prepend(`Error: ${JSON.stringify(json.data.data)}`);
                //         ConsoleService.prepend('');
                //     }

                //     return;
                // }

                if(json.type === "saved"){
                    // project.update((project) => {
                    //     if(project.id != json.data) {
                    //         project.id = json.data;
                    //     }
                    //     return project;
                    // });
                    // const queryUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${json.data}`;
                    // window.history.pushState({path:queryUrl},'',queryUrl);
                    // saveDebounce();
                    console.log('json', json);
                    if(buildResolver){
                        buildResolver(json);
                        buildResolver = null;
                    }
                    return;
                }

                // if(json.type === "loaded"){
                //     try {
                //         const loadedProject = JSON.parse(json.data);
                //         project.set(new Project(loadedProject.id, loadedProject.name, loadedProject.files, loadedProject.selectedFile, loadedProject.openFiles, loadedProject.createdAt));
                //     } catch (error) {
                //         console.error('Error parsing loaded project:', error);
                //     }

                //     return;
                // }

                // if(json.type === "no-project"){
                //     try {
                //         const queryUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
                //         window.history.pushState({path:queryUrl},'',queryUrl);
                //         project.set(new Project("","Untitled Project", starterProject, starterProject[0].id, [starterProject[0].id, starterProject[1].id]));
                //     } catch (error) {
                //         console.error('Error parsing loaded project:', error);
                //     }

                //     return;
                // }
            });

            socket.addEventListener('close', () => {
                console.log('WebSocket connection closed');
                reject(false);
            });

            socket.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            });
        });
    }

    static async build(project:Project){
        console.log('building project', project.id, project);
        await ApiService.save(project);

        let promise:any = null;
        promise = new Promise(r => {
            buildResolver = r;
        })

        ConsoleService.prepend(`Building project "${project.name}"...`);
        ApiService.sendMessage('build', {id: project.id});

        return promise;
    }

    static save(project:Project){
        let promise:any = null;
        promise = new Promise(r => {
            buildResolver = r;
        })

        ApiService.sendMessage('save', project);
        return promise;
    }

    static deploy(project:Project, build:boolean = true){
        if(!build) ConsoleService.prepend(`Deploying contract to Jungle Testnet...`);
        else ConsoleService.prepend(`Building and deploying contract to Jungle Testnet...`);

        ApiService.sendMessage('deploy', {network:'jungle', id:project.id, build});
    }

    // static interact(network:string, contract:string, actionData:any){
    //     ConsoleService.prepend(`Interacting with your contract...`);
    //     let sender;
    //     senderAccount.update((account) => {
    //         sender = account;
    //         return account;
    //     });
    //     ApiService.sendMessage('interact', {network, contract, actionData, senderAccount:sender});
    // }

    static getTableData(network:string, contract:string, table:string, scope:string){
        ApiService.sendMessage('table-data', {network, contract, table, scope});
    }

    static sendMessage(type:string, data:any){
        socket.send(JSON.stringify({type, data}));
    }

}
