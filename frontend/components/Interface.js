import React, { useState } from 'react';
import $u from '../utils/$u';
import { ethers } from "ethers";

const wc  = require("../circuit/witness_calculator.js");
const tornadoAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const tornadoJSON = require("../json/Tornado.json");
const tornadoABI = tornadoJSON.abi; 
const tornadoInterface = new ethers.utils.Interface(tornadoABI);


const Interface = () => {
    const [account, updateAccount] = useState(null);
    const [proofElements, updateProofElements] = useState(null); 
    const [proofStringEl, updateProofStringEl] = useState(null); 
    const [textArea, updateTextArea] = useState(null); 
    
    const connectMetamask = async () => {
        try{
            if(!window.ethereum){
                alert("Please install Metamask to use this app.");
                throw new Error("Metamask not installed!");
            }
            var accounts = await window.ethereum.request({method: "eth_requestAccounts"});
            var chainId = window.ethereum.networkVersion;
            var activeAccount = accounts[0];
            var balance = await window.ethereum.request({method: "eth_getBalance", params: [activeAccount, "latest"]});
            balance = $u.moveDecimalLeft(ethers.BigNumber.from(balance).toString(), 18);

            var newAccountState = {
                chainId: chainId,
                address: activeAccount,
                balance: balance
            };

            updateAccount(newAccountState);


        }catch(err){
            console.error(err);
            // throw err;
        }
    };

    const depostEther = async () => {
        // Deposit secret, and the nullifier
        const secret = ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString();
        const nullifier = ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString();

        const input = {
            secret: $u.BN256ToBin(secret).split(""),
            nullifier: $u.BN256ToBin(nullifier).split("")
        };

        var res = await fetch("/deposit.wasm");
        var buffer = await res.arrayBuffer();
        var depositWC = await wc(buffer);

        const r = await depositWC.calculateWitness(input, 0);
        
        const commitment = r[1];
        const nullifierHash = r[2];

        const value = ethers.BigNumber.from("100000000000000000").toHexString();

        const tx = {
            to: tornadoAddress,
            from: account.address,
            value: value,
            data: tornadoInterface.encodeFunctionData("deposit", [commitment])
        };

        try{
            console.log(tx);
            const txHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [tx] });

            console.log(txHash);
            const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [txHash] });
            const log = receipt.logs[0];
            const decodedData = tornadoInterface.decodeEventLog("Deposit", log.data, log.topics);
            
            const proofElements = {
                root: $u.BNToDecimal(decodedData.root),
                nullifierHash: `${nullifierHash}`,
                secret: secret,
                nullifier: nullifier,
                commitment: `${commitment}`,
                hashPairings: decodedData.hashPairings.map((n) => ($u.BNToDecimal(n))),
                hashDirections: decodedData.pairDirection
            };
            
            updateProofElements(btoa(JSON.stringify(proofElements)));
        }catch(err){
            console.error(err);
        }
    }

    const copyProof = () => {
        if(proofStringEl)
            navigator.clipboard.writeText(proofStringEl.innerHTML);

    }

    const withdraw = async () => {
        if(!textArea || !textArea.value) {alert("Input the proofs!")}
        try{
            const proofString = textArea.value;
            const proofElements = JSON.parse(atob(proofString));
            const SnarkJS = window['snarkjs'];

            const proofInput = {
                "root": proofElements.root,
                "nullifierHash": proofElements.nullifierHash,
                "recipient": $u.BNToDecimal(account.address),
                "secret": $u.BN256ToBin(proofElements.secret).split(""),
                "nullifier": $u.BN256ToBin(proofElements.nullifier).split(""),
                "hashPairings": proofElements.hashPairings,
                "hashDirections": proofElements.hashDirections,
            };

            const { proof, publicSignals } = await SnarkJS.groth16.fullProve(proofInput, "/finale/withdraw.wasm", "/finale/setup_final.zkey");
            
            const callInputs = [
                proof.pi_a.slice(0, 2).map($u.BN256ToHex),
                proof.pi_b.slice(0, 2).map((row) => ($u.reverseCoordinate(row.map($u.BN256ToHex)))),
                proof.pi_c.slice(0, 2).map($u.BN256ToHex),
                publicSignals.slice(0, 2).map($u.BN256ToHex)
            ];
            const callData = tornadoInterface.encodeFunctionData("withdraw", callInputs);
            const tx = {
                to: tornadoAddress,
                from: account.address,
                data: callData
            };
            const txHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [tx] });
            const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [txHash] });
            console.log(`Receipt of Withdrawal!`);
            console.log(receipt);
        }catch(err){
            console.error(err);
        }
    }

    return (
        <div>
            {
                !!account ? (
                    <div>
                        <p>ChainId: {account.chainId}</p>
                        <p>Wallet Address: {account.address}</p>
                        <p>Balance: {account.balance} ETH</p>
                    </div>
                ) : (
                    <div>
                        <button onClick={connectMetamask}>Connect Metamask</button>
                    </div>
                )
            }

            <div>
                <hr />
            </div>

            {
                !!account ? (
                    <div>
                        {
                            !!proofElements ? (
                                <div>
                                    <p><strong>Proof of Deposit</strong></p>
                                    <div style={{ maxWidth: "100vw" , overflowWrap: "break-word"}}>
                                        <span ref={(proofStringEl) => {updateProofStringEl(proofStringEl)}}>{proofElements}</span>
                                    </div>
                                    {
                                        !!proofStringEl && (
                                            <button onClick={copyProof}>Copy Proof String</button>
                                        )
                                    }
                                    
                                </div>
                            ) : (
                                <button onClick={depostEther}>Depost 1 ETH</button>
                            )
                        }
                        
                    </div>
                ) : (
                    <div>
                        <p>You need to connect to Metamask to use this functionality</p>
                    </div>
                )
            }
            
            <div>
                <hr />
            </div>
            
            {
                !!account ? (
                    <div>
                        <div>
                            <textarea ref={(ta) => {updateTextArea(ta);} }></textarea>
                        </div>
                        <button onClick={withdraw}>Withdraw 1 ETH</button>
                    </div>
                ): (
                    <div>
                        <p>You need to connect to Metamask to use this functionality</p>
                    </div>
                )
            }

        </div>
    )
}

export default Interface