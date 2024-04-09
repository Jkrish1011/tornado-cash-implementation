import React, { useState } from 'react';
import $u from '../utils/$u';
import { ethers } from "ethers";

// 0xc2aE68c05EF10B4c74decB43558B44Bfaa085c2d
// 0x1DCCB25d084f0cb830B2C6a477F933BA8150f0D8
// 0x5523A2621d152D579BBae3E461fF789417d565Be
const wc  = require("../circuit/witness_calculator.js");
const tornadoAddress = "0x5523A2621d152D579BBae3E461fF789417d565Be";
const tornadoJSON = require("../json/Tornado.json");
const tornadoABI = tornadoJSON.abi; 
const tornadoInterface = new ethers.utils.Interface(tornadoABI);


const Interface = () => {
    const [account, updateAccount] = useState(null);
    const [proofElements, updateProofElements] = useState(null); 
    const [proofStringEl, updateProofStringEl] = useState(null); 
    const [textArea, updateTextArea] = useState(null); 
    const [displayCopiedMessage, updateDisplayCopiedMessage] = useState(false); 
    const [withdrawalSuccessfull, updateWithdrawalSuccessfull] = useState(false); 
    const [section, updateSection] = useState("Deposit");


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
            // var receipt;
            // while(!receipt){
            //     receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [txHash] });
            //     await new Promise((resolve, reject) => { setTimeout(resolve, 1000); });
            // }
            
            // const log = receipt.logs[0];
            // const decodedData = tornadoInterface.decodeEventLog("Deposit", log.data, log.topics);
            
            const proofElements = {
                nullifierHash: `${nullifierHash}`,
                secret: secret,
                nullifier: nullifier,
                commitment: `${commitment}`,
                txHash: txHash
                // hashPairings: decodedData.hashPairings.map((n) => ($u.BNToDecimal(n))),
                // hashDirections: decodedData.pairDirection,
                // root: $u.BNToDecimal(decodedData.root)
            };
            
            updateProofElements(btoa(JSON.stringify(proofElements)));
        }catch(err){
            console.error(err);
        }
    }

    const copyProof = () => {
        flashCopiedMessage();
        if(proofStringEl)
            navigator.clipboard.writeText(proofStringEl.innerHTML);

    }

    const flashCopiedMessage = async () => {
        updateDisplayCopiedMessage(true);
        setTimeout(() => {
            updateDisplayCopiedMessage(false);
        }, 1000);
    }

    const withdraw = async () => {
        if(!textArea || !textArea.value) {alert("Input the proofs!")}
        try{
            const proofString = textArea.value;
            const proofElements = JSON.parse(atob(proofString));
            const SnarkJS = window['snarkjs'];

            var receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [proofElements.txHash] });

            if(!receipt)
                throw new Error("empty receipt!");
             
            
            const log = receipt.logs[0];
            const decodedData = tornadoInterface.decodeEventLog("Deposit", log.data, log.topics);

            const proofInput = {
                "root": $u.BNToDecimal(decodedData.root),
                "nullifierHash": proofElements.nullifierHash,
                "recipient": $u.BNToDecimal(account.address),
                "secret": $u.BN256ToBin(proofElements.secret).split(""),
                "nullifier": $u.BN256ToBin(proofElements.nullifier).split(""),
                "hashPairings": decodedData.hashPairings.map((n) => ($u.BNToDecimal(n))),
                "hashDirections": decodedData.pairDirection,
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
            const receipt2 = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [txHash] });
            
            if(!!receipt2) {
                updateWithdrawalSuccessfull(true);
            }
        }catch(err){
            console.error(err);
        }
    }

    return (
        <div>
            <nav className="navbar navbar-nav fixed-top bg-dark text-light">
                {
                    !!account ? (
                        <div className="container">
                            <div className="navbar-left">
                                <span><strong>ChainId:</strong></span>
                                <br/>
                                <span>{account.chainId}</span>
                            </div>
                            <div className="navbar-right">
                                <span><strong>{account.address.slice(0, 12) + "..."}</strong></span>
                                <br/>
                                <span className="small">{account.balance.slice(0, 10) + ((account.balance.length > 10) ? ("...") : (""))} ETH</span>
                            </div>
                        </div>
                    ) : (
                        <div className="container">
                            <div className="navbar-left"><h5>NFTA-Tornado</h5></div>
                            <div className="navbar-right">
                                <button 
                                    className="btn btn-primary" 
                                    onClick={connectMetamask}
                                >Connect Metamask</button>
                            </div>
                        </div>
                    )
                }

                
            </nav>

            <div style={{height: "60px"}}></div>

            <div className='container' style={{marginTop: 60 }}>
                <div className='card mx-auto' style={{maxWidth: 450}}>
                    <div className='card-body'>
                        <div className='btn-group' style={{marginBottom: 20}}>
                            {
                                section === "Deposit"? (
                                    <button className='btn btn-primary'>Deposit</button>
                                ): (
                                    <button onClick={() => {updateSection("Deposit");}} className='btn btn-outline-primary'>Deposit</button>
                                )
                            }
                            {
                                section === "Deposit"? (
                                    <button onClick={() => {updateSection("Withdraw");}} className='btn btn-outline-primary'>Withdraw</button>
                                ): (
                                    <button className='btn btn-primary'>Withdraw</button>
                                    
                                )
                            }
                        </div>

                        {
                            section == "Deposit" && !!account && (
                                <div>
                                    {
                                        !!proofElements ? (
                                            <div>
                                                <div className='alert alert-success'>
                                                    <p><strong>Proof of Deposit</strong></p>
                                                    <div className='p-1' style={{lineHeight: "12px"}}>
                                                        <span style={{fontSize: 10}} ref={(proofStringEl) => {updateProofStringEl(proofStringEl)}}>{proofElements}</span>
                                                    </div>
                                                </div>
                                                <button className='btn btn-success' onClick={copyProof}><span className='small'>Copy Proof String</span></button>
                                                {
                                                    (!!displayCopiedMessage) && (
                                                        <span className='small'><strong className='p-2' style={{color: 'green'}}>Copied!</strong></span>
                                                    )
                                                }
                                            </div>
                                        ) : (
                                            <div>
                                                <p className='text-secondary'>Note: All deposits and withdrawals are of the same denomiation of 1 ETH.</p>
                                                <button className='btn btn-success' onClick={depostEther}><span className='small'>Depost 1 ETH</span></button>
                                            </div>
                                        )
                                    }
                                </div>
                            ) 
                        }

                        {
                            section != "Deposit" && !!account && (
                                <div>
                                    {
                                        (withdrawalSuccessfull ) ? (
                                            <div>
                                                <div className='alert alert-success p-3'>
                                                    <div >
                                                        <span><strong>Success!</strong></span>
                                                        <div style={{marginTop: 5}}>
                                                            <span className='text-secondary'>
                                                                Withdrawal Successful. you can check your wallet!
                                                            </span>

                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ): (
                                            <div>
                                                <div>
                                                    <p className='text-secondary'>Note: All deposits and withdrawals are of the same denomiation of 1 ETH.</p>
                                                    <div className='form-group'>
                                                        <textarea className='form-control' style={{resize: "none"}} ref={(ta) => {updateTextArea(ta);} }></textarea>
                                                    </div>
                                                    <button className='btn btn-primary' onClick={withdraw}><span className='small'>Withdraw 1 ETH</span></button>
                                                </div>
                                            </div>
                                        )
                                    }
                               </div>
                            ) 
                        }   
                        {
                            (!account) && (
                                <div>
                                    <p>Connect Your Wallet Please</p>
                                </div>
                            )
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Interface