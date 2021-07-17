import { task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
// import "hardhat-typechain";
import "./misc/typechain-ethers-v5-mcdex"
import "hardhat-contract-sizer";
// import "hardhat-gas-reporter";
// import "hardhat-abi-exporter";

import "solidity-coverage"
import { retrieveLinkReferences } from "./scripts/deployer/linkReferenceParser";

const pk = process.env["PK"]

task("accounts", "Prints the list of accounts", async (args, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

task("encode", "Encode calldata")
    .addPositionalParam("sig", "Signature of contract to deploy")
    .addOptionalPositionalParam("args", "Args of function call, seprated by common ','")
    .setAction(async (args, hre) => {
        if (typeof args.args != 'undefined') {
            args.args = args.args.split(',')
        }
        args.sig = args.sig.replace('function ', '')
        var iface = new hre.ethers.utils.Interface(["function " + args.sig])
        var selector = args.sig.slice(0, args.sig.indexOf('('))
        // console.log(args.sig, args.args, selector)
        var calldata = iface.encodeFunctionData(selector, args.args)
        console.log("encoded calldata", calldata)
    })


task("deploy", "Deploy a single contract")
    .addPositionalParam("name", "Name of contract to deploy")
    .addOptionalPositionalParam("args", "Args of contract constructor, separated by common ','")
    .setAction(async (args, hre) => {
        if (typeof args.args != 'undefined') {
            args.args = args.args.split(',')
        }
        let nonce = await hre.ethers.provider.getTransactionCount(await hre.ethers.provider.getSigner(0).getAddress(), 'pending')
        console.log('nonce', nonce)
        const linkReferences = await retrieveLinkReferences('./artifacts/contracts')
        const links = {}
        const go = async (name) => {
            const innerLinks = {}
            for (let linkedContractName of linkReferences[name] || []) {
                if (linkedContractName in links) {
                    innerLinks[linkedContractName] = links[linkedContractName];
                } else {
                    const deployed = await go(linkedContractName);
                    innerLinks[linkedContractName] = deployed;
                    links[linkedContractName] = deployed;
                }
            }
            const factory = await hre.ethers.getContractFactory(name, { libraries: innerLinks });
            const constructArgs = args.args ? args.args : []
            constructArgs.push({ nonce: nonce++ })
            const deployed = await factory.deploy(...constructArgs);
            console.log(name, 'deployed at', deployed.address);
            await deployed.deployTransaction.wait();
            return deployed.address;
        }
        await go(args.name);
    })

task("send", "Call contract function")
    .addPositionalParam("address", "Address of contract")
    .addPositionalParam("sig", "Signature of contract")
    .addOptionalPositionalParam("args", "Args of function call, seprated by common ','")
    .setAction(async (args, hre) => {
        if (typeof args.args != 'undefined') {
            args.args = args.args.split('|')
        }
        args.sig = args.sig.replace('function ', '')
        var iface = new hre.ethers.utils.Interface(["function " + args.sig])
        var selector = args.sig.slice(0, args.sig.indexOf('('))
        // console.log(args.sig, args.args, selector)
        var calldata = iface.encodeFunctionData(selector, args.args)
        // console.log("encoded calldata", calldata)
        const signer = hre.ethers.provider.getSigner(0);

        const tx = await signer.sendTransaction({
            to: args.address,
            from: signer._address,
            data: calldata,
        });
        console.log(tx);
        console.log(await tx.wait());
    })

task("call", "Call contract function")
    .addPositionalParam("address", "Address of contract")
    .addPositionalParam("sig", "Signature of contract")
    .addOptionalPositionalParam("args", "Args of function call, seprated by common ','")
    .setAction(async (args, hre) => {
        if (typeof args.args != 'undefined') {
            args.args = args.args.split('|')
        }
        args.sig = args.sig.replace('function ', '')
        var iface = new hre.ethers.utils.Interface(["function " + args.sig])
        var selector = args.sig.slice(0, args.sig.indexOf('('))
        console.log(args.sig, args.args, selector)
        var calldata = iface.encodeFunctionData(selector, args.args)
        //       console.log("encoded calldata", calldata)
        const signer = hre.ethers.provider.getSigner(0);
        const result = await signer.call({
            to: args.address,
            data: calldata,
        })
        console.log("result", result);
    })

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true
        },
        bsc: {
            url: "https://bsc-dataseed4.binance.org/",
            accounts: [pk],
            timeout: 300000,
            confirmations: 1,
        },
        kovan: {
            url: "https://kovan.infura.io/v3/",
            gasPrice: 1e9,
            accounts: [pk],
            timeout: 300000,
            confirmations: 1,
        },
        bscTestnet: {
            url: "https://data-seed-prebsc-2-s1.binance.org:8545/",
            gasPrice: 20e9,
            // accounts: [""],
            timeout: 300000,
            confirmations: 1,
        },
        arb1: {
            url: `https://arb1.arbitrum.io/rpc`,
            gasPrice: 5e8,
            blockGasLimit: "80000000",
            accounts: [pk],
        },
        arbrinkeby: {
            url: "https://rinkeby.arbitrum.io/rpc",
            gasPrice: 1e9,
            accounts: [pk],
            timeout: 300000,
            confirmations: 1,
        },
    },
    solidity: {
        version: "0.7.4",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1
            }
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    mocha: {
        timeout: 600000
    }
};
