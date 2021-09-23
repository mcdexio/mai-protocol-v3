const { ethers } = require("hardhat");
import {
    toWei,
    createFactory,
    createContract,
    setDefaultSigner
} from "./utils";

function toMap(a) {
    const m = {};
    a.forEach(function (e) {
        m[e[0]] = e[1];
    });
    return m;
}

async function deployLibraries() {
    const AMMModule = await createContract("AMMModule");
    const CollateralModule = await createContract("CollateralModule");
    const OrderModule = await createContract("OrderModule");
    const PerpetualModule = await createContract("PerpetualModule");
    const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], { CollateralModule, AMMModule, PerpetualModule });
    const TradeModule = await createContract("TradeModule", [], { AMMModule, LiquidityPoolModule });
    console.table([
        ["AMMModule", AMMModule.address],
        ["CollateralModule", CollateralModule.address],
        ["OrderModule", OrderModule.address],
        ["PerpetualModule", PerpetualModule.address],
        ["LiquidityPoolModule", LiquidityPoolModule.address],
        ["TradeModule", TradeModule.address],
    ])
    // 2021/1/13 kovan
    // │    0    │      'AMMModule'      │ '0x0A1334aCea4E38a746daC7DCf7C3E61F0AB3D834' │
    // │    1    │  'CollateralModule'   │ '0x25E74e6D8A414Dff02c9CCC680B49F3708955ECF' │
    // │    2    │     'OrderModule'     │ '0x0530ed22a74c57CcD48d181085e78F60280E939b' │
    // │    3    │   'PerpetualModule'   │ '0x6EF05857FA25A81401407dE3D57Ebcb45A746E70' │
    // │    4    │ 'LiquidityPoolModule' │ '0xf5605bBed7BF76c276b6D8468F560a7B76077932' │
    // │    5    │     'TradeModule'     │ '0x99C30392BDe2161019eCa7c3d5fFc4BCf55489b2' │

    // 2021/1/15 kovan
    // │    0    │      'AMMModule'      │ '0xf9d087E0687356101078DC80A24e9A2296B87228' │
    // │    1    │  'CollateralModule'   │ '0xb972336415C9A8e264Ab44dfd1188293e23511ba' │
    // │    2    │     'OrderModule'     │ '0xF59fD05e4575ddC7BF37183b8aFDD042A085Ce55' │
    // │    3    │   'PerpetualModule'   │ '0x4db2EFBfa164Cf893bd0E6a9fDcAD932844FeEC3' │
    // │    4    │ 'LiquidityPoolModule' │ '0xfE0a7Df6c1c38c384Ac2b23F444bbf6Bc147Cd53' │
    // │    5    │     'TradeModule'     │ '0x04f361eAe689282BcCbA6D05711641FB5D161F1B' │

    // 2021/1/28 kovan
    // │    0    │      'AMMModule'      │ '0x6154996e1C80dE982f9eebC3E93B4DFd4F30a74a' │
    // │    1    │  'CollateralModule'   │ '0xbE4094f6eA19FBd59950139145a94CfC9ACe7f2E' │
    // │    2    │     'OrderModule'     │ '0x406A99DAFb06fC7050dfF78d53c6c013EA9Ed464' │
    // │    3    │   'PerpetualModule'   │ '0x5B7b919734ed0CedBD076BE3c4272bd2d08E1bb4' │
    // │    4    │ 'LiquidityPoolModule' │ '0x6A3D71b6B208B3626E20d5d2cD334628dd57cdd6' │
    // │    5    │     'TradeModule'     │ '0x56deCcd5C9b0E41C1F1129990e0d1E54713a8593' │

    // 2021/2/8 kovan
    // │    0    │      'AMMModule'      │ '0xf0e6480cea3ccb86f9e91063e5c7E73705D3B98f' │
    // │    1    │  'CollateralModule'   │ '0x0D7D906c0dA5b063536edB6F0fD67bAd86E4ec05' │
    // │    2    │     'OrderModule'     │ '0x5b8147Cb4E7A9F75652F90bAFa69325627680e55' │
    // │    3    │   'PerpetualModule'   │ '0x7FCE4ECCe2026a370B82333020bAFDD794D2376D' │
    // │    4    │ 'LiquidityPoolModule' │ '0xAfcbD2De178c7A84DB8C5616f707A08D25d56F60' │
    // │    5    │     'TradeModule'     │ '0xf72cce2af89Fe69Bbab69950eB2050CB0Aeb9743' │

    // 2021/3/10 kovan
    // │    0    │      'AMMModule'      │ '0x1B114EA6E969f817DFdb74D503128927936Ad715' │
    // │    1    │  'CollateralModule'   │ '0xF598F8c0b86D37884D76e11A979955c191A008C1' │
    // │    2    │     'OrderModule'     │ '0xB78E12f984bbe71897DbF6c3371119E31b24A989' │
    // │    3    │   'PerpetualModule'   │ '0x4c13f37A1198c1539796014d50079dCB266C9B88' │
    // │    4    │ 'LiquidityPoolModule' │ '0x349eFDf923EfC83d43377a85e5CCADe3147ebf32' │
    // │    5    │     'TradeModule'     │ '0x4592021F3AC4aaED5411f35c33175B2A3845C498' │

    // 2021/4/8 kovan insurance
    // │    0    │      'AMMModule'      │ '0x5c0d66d526b76d3bc98e4e91925980caac58d6b2' │
    // │    1    │  'CollateralModule'   │ '0x18b93dc93eb9b3eca7997e02c52ec1d21336a20e' │
    // │    2    │     'OrderModule'     │ '0xd8eb9a8bbf3bb27eebdaa39856eb25633961c0d1' │
    // │    3    │   'PerpetualModule'   │ '0x974a6ec1fa9fb5dfb8587c0ee2216920caf6e8f1' │
    // │    4    │ 'LiquidityPoolModule' │ '0xFFADf894f6520941970bf798e4c9379e398e4931' │
    // │    5    │     'TradeModule'     │ '0xef3fa221d6485884aC2887f9D285963c86CbE89C' │
}

async function createLiquidityPoolFactory() {
    return await ethers.getContractFactory(
        "LiquidityPool",
        {
            libraries: {
                AMMModule: "0x5c0d66d526b76d3bc98e4e91925980caac58d6b2",
                OrderModule: "0xd8eb9a8bbf3bb27eebdaa39856eb25633961c0d1",
                LiquidityPoolModule: "0xFFADf894f6520941970bf798e4c9379e398e4931",
                TradeModule: "0xef3fa221d6485884aC2887f9D285963c86CbE89C",
            }
        }
    )
}

async function deployOracle() {
    const oracle3 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    const oracle4 = await createContract("OracleAdaptor", ["USD", "BTC"]);
    const oracle5 = await createContract("OracleAdaptor", ["USD", "DPI"]);
    const oracle6 = await createContract("OracleAdaptor", ["USD", "DOT"]);
    const oracle7 = await createContract("OracleAdaptor", ["USD", "SP500"]);
    const oracle8 = await createContract("OracleAdaptor", ["USD", "TSLA"]);
    const oracleRouterCreator = await createContract("OracleRouterCreator");

    // index printer
    const owner = "0x1a3F275b9Af71D597219899151140a0049DB557b";
    await oracle3.transferOwnership(owner);
    await oracle4.transferOwnership(owner);
    await oracle5.transferOwnership(owner);
    await oracle6.transferOwnership(owner);
    await oracle7.transferOwnership(owner);
    await oracle8.transferOwnership(owner);

    // router: USD/ETH
    let path = [{ oracle: oracle3.address, isInverse: true }];
    let tx = await oracleRouterCreator.createOracleRouter(path);
    await tx.wait();
    const oracle1 = await oracleRouterCreator.routers(await oracleRouterCreator.getPathHash(path));

    // router: BTC/ETH
    path = [{ oracle: oracle3.address, isInverse: true }, { oracle: oracle4.address, isInverse: false }];
    tx = await oracleRouterCreator.createOracleRouter(path);
    await tx.wait();
    const oracle2 = await oracleRouterCreator.routers(await oracleRouterCreator.getPathHash(path));

    const addresses = [
        ["oracleRouterCreator", oracleRouterCreator.address],
        ["USD - ETH", oracle1],
        ["BTC - ETH", oracle2],
        ["ETH - USD", oracle3.address],
        ["BTC - USD", oracle4.address],
        ["DPI - USD", oracle5.address],
        ["DOT - USD", oracle6.address],
        ["SP500 - USD", oracle7.address],
        ["TSLA - USD", oracle8.address],
    ];
    console.table(addresses);
    return toMap(addresses);

    // 2021/1/13 kovan / https://kovan.etherscan.io/address/0xa2aAD83466241232290bEbcd43dcbFf6A7f8d23a
    // ┌─────────┬───────────────┬──────────────────────────────────────────────┐
    // │ (index) │       0       │                      1                       │
    // ├─────────┼───────────────┼──────────────────────────────────────────────┤
    // │    0    │  'USD - ETH'  │ '0x27Ca190b32D8fe7274E84f575feF6E22BDEcA4A5' │
    // │    1    │  'BTC - ETH'  │ '0x547b6e5116B6A9167648f1C9d5e5e84ceAC62aae' │
    // │    2    │  'ETH - USD'  │ '0x6fd4C6D4DAA885A948eC8d218e9eaBD638296aFC' │
    // │    3    │  'BTC - USD'  │ '0x34Ee759Dd399F35E63d08A9A5834C148b3fC974F' │
    // │    4    │  'DPI - USD'  │ '0x07A843FCD4F150700275AD0A5A3A252e50503290' │
    // │    5    │ 'SP500 - USD' │ '0x131a6d689a46c947223937929583a586c32Fb349' │
    // └─────────┴───────────────┴──────────────────────────────────────────────┘


    // 2021/1/15 kovan
    // ┌─────────┬───────────────┬──────────────────────────────────────────────┐
    // │ (index) │       0       │                      1                       │
    // ├─────────┼───────────────┼──────────────────────────────────────────────┤
    // │    0    │  'USD - ETH'  │ '0x9Eb6fFf00730a3FDF38A675252aDe65BF3e17D09' │
    // │    1    │  'BTC - ETH'  │ '0x08E6c0e74799EAF55Ce8bdB13e976f038f86ad3e' │
    // │    2    │  'ETH - USD'  │ '0xAcEe0E35dbE08f36563D9Dd6faa687331c39E09A' │
    // │    3    │  'BTC - USD'  │ '0x462F1689663C23Af40bc7011765368D6e83C364b' │
    // │    4    │  'DPI - USD'  │ '0x95eA3D74F5c3616ab1a6bAeCacb5DE6240ADdbd1' │
    // │    5    │  'DOT - USD'  │ '0x38D023c4BfECC83a9Cd7abe4450ceFF944963487' │
    // │    6    │ 'SP500 - USD' │ '0x8e077970fF90d3F1f4ea20fa441AfCBf6A02272E' │
    // │    7    │ 'TSLA - USD'  │ '0xE3bFBe59b711A14660d7f5B55982C3a975168156' │
    // └─────────┴───────────────┴──────────────────────────────────────────────┘

    // 2021/1/28
    // ┌─────────┬───────────────┬──────────────────────────────────────────────┐
    // │ (index) │       0       │                      1                       │
    // ├─────────┼───────────────┼──────────────────────────────────────────────┤
    // │    0    │  'USD - ETH'  │ '0x1B779E332F26606A2F827Adf1A5bC3f79C20121f' │
    // │    1    │  'BTC - ETH'  │ '0xce8CB0f1DE505ED1A00Cc09b769a83ACcC414763' │
    // │    2    │  'ETH - USD'  │ '0x84F9B276de73c6766aB714f095C93ef2aeE0952E' │
    // │    3    │  'BTC - USD'  │ '0xDEFa9C8a646DFE2960833A05898387206B08b342' │
    // │    4    │  'DPI - USD'  │ '0x231B873bD2ae8707e325fbe45850308e18ed714d' │
    // │    5    │  'DOT - USD'  │ '0x91413ad76641Ab090b61EfEF9Cc51F3acA123350' │
    // │    6    │ 'SP500 - USD' │ '0xa4d055E817540D0f5b6DDd4916a758D77B5E7E55' │
    // │    7    │ 'TSLA - USD'  │ '0x1e723a23324a61ceFD50e00dDa56B1d2388426E2' │
    // └─────────┴───────────────┴──────────────────────────────────────────────┘
    //
    // 2021/2/8
    // │    0    │ 'oracleRouterCreator' │ '0x380bd9EE6c4a00a4c98a64CBcC5bd6affBEa06a7' │
    // │    1    │      'USD - ETH'      │ '0x445689A1AeF357e21862Bf6b27F0996dA6A02165' │
    // │    2    │      'BTC - ETH'      │ '0x5a6cC15376B343238ef279fcBeeb7cf9a757B44d' │
    // │    1    │ 'Oracle  \'ETH - USD\'  ' │      '0x84F9B276de73c6766aB714f095C93ef2aeE0952E'       │
    // │    2    │ 'Oracle  \'BTC - USD\'  ' │      '0xDEFa9C8a646DFE2960833A05898387206B08b342'       │
    // │    3    │ 'Oracle  \'DPI - USD\'  ' │      '0x231B873bD2ae8707e325fbe45850308e18ed714d'       │
    // │    4    │ 'Oracle  \'DOT - USD\'  ' │      '0x91413ad76641Ab090b61EfEF9Cc51F3acA123350'       │
    // │    5    │ 'Oracle  \'SP500 - USD\'' │      '0xa4d055E817540D0f5b6DDd4916a758D77B5E7E55'       │
    // │    6    │ 'Oracle  \'TSLA - USD \'' │      '0x1e723a23324a61ceFD50e00dDa56B1d2388426E2'       │

}

async function main(accounts: any[]) {
    var deployer = { address: "0xa2aAD83466241232290bEbcd43dcbFf6A7f8d23a" }
    var vault = { address: "0xd69c3820627daC4408CE629730EB8E891F8d5731" }
    var vaultFeeRate = toWei("0.00015");

    // 1. oracle
    // const oracleAddresses = await deployOracle();
    // return
    const oracleAddresses = toMap([
        ["USD - ETH", "0x445689A1AeF357e21862Bf6b27F0996dA6A02165"],
        ["BTC - ETH", "0x5a6cC15376B343238ef279fcBeeb7cf9a757B44d"],
        ["ETH - USD", "0x84F9B276de73c6766aB714f095C93ef2aeE0952E"],
        ["BTC - USD", "0xDEFa9C8a646DFE2960833A05898387206B08b342"],
        ["DPI - USD", "0x231B873bD2ae8707e325fbe45850308e18ed714d"],
        ["DOT - USD", "0x91413ad76641Ab090b61EfEF9Cc51F3acA123350"],
        ["SP500 - USD", "0xa4d055E817540D0f5b6DDd4916a758D77B5E7E55"],
        ["TSLA - USD", "0x1e723a23324a61ceFD50e00dDa56B1d2388426E2"],
    ]);

    // 2. libraries
    // await deployLibraries()
    // return

    // 3. factory
    // var symbol = await createContract("SymbolService", [10000])
    // const symbol = await (await createFactory("SymbolService")).attach('0x0A701c621210859eAbE2F47BE37456BEc2427462')
    // var poolCreatorTmpl = await createContract("PoolCreator")
    // const admin = '0x1a3F275b9Af71D597219899151140a0049DB557b'
    // var poolCreator = await createContract("TransparentUpgradeableProxy", [
    //     poolCreatorTmpl.address, // logic
    //     admin,
    //     '0x', // data
    //     { gasLimit: 5000000 }
    // ])
    // var broker = await createContract("Broker")
    // const addresses = [
    //     ["poolCreatorTmpl", poolCreatorTmpl.address],
    //     ["poolCreator", `${poolCreator.address} @ ${poolCreator.blockNumber}`],
    //     ["symbol", symbol.address],
    //     ["broker", broker.address],
    // ];
    // console.table(addresses);
    // return

    // white list
    const symbol = await (await createFactory("SymbolService")).attach('0x0A701c621210859eAbE2F47BE37456BEc2427462')
    const poolCreator = await (await createFactory("PoolCreator")).attach('0x0956a627788199bE312c9a1f2d8cBA70ec30fCb5')
    var weth = { address: "0xd0A1E359811322d97991E03f863a0C30C2cF029C" }

    // await (await poolCreator.initialize(
    //     symbol.address, vault.address, vaultFeeRate, { gasLimit: 5000000 }
    // )).wait()
    // await (await symbol.addWhitelistedFactory(poolCreator.address)).wait();
    // return

    // 2021 / 1 / 13 kovan / https://kovan.etherscan.io/address/0xa2aAD83466241232290bEbcd43dcbFf6A7f8d23a
    // │    0    │    'weth'     │ '0xd0A1E359811322d97991E03f863a0C30C2cF029C' │
    // │    1    │    'usdc'     │ '0x59edD5AEBf97955F53a094B49221E63F544ddA5a' │
    // │    3    │ 'poolCreator' │ '0xFc3Cf479C7EC041f7A75710d5B0aE22407aD766e' │
    // │    4    │   'symbol'    │ '0x465fB17aCc62Efd26D5B3bE9B3FFC984Cebd03d1' │
    // │    5    │ 'brokerRelay' │ '0xF9Aa44df5dD1DFD321c9Dd7cDa892a046135A054' │

    // 2021/1/15 kovan
    // │    0    │    'weth'     │ '0xd0A1E359811322d97991E03f863a0C30C2cF029C' │
    // │    1    │    'usdc'     │ '0xd4AC81D9FD2b28363eBD1D88a8364Ff3b3577e84' │
    // │    2    │ 'poolCreator' │ '0xfa81036567A378C44C5bC13323416aECfeD29D09' │
    // │    3    │   'symbol'    │ '0x02ae5f2802941789311d0b21969ff52178CeC555' │
    // │    4    │ 'brokerRelay' │ '0xF3B092451cDBD827105aB593222975c5B0F91578' │

    // 2021/1/28
    // │    0    │      'weth'      │ '0xd0A1E359811322d97991E03f863a0C30C2cF029C' │
    // │    1    │    'governor'    │ '0xaae7556C23B213c605D01C88385ee1e025B27F0f' │
    // │    2    │ 'shareTokenTmpl' │ '0xA30128343816bBA44EB934b6136cf6d0633934EA' │
    // │    3    │  'poolCreator'   │ '0x0c8B800A797541bF43ABe26C850DBeD352B6230c' │
    // │    4    │     'symbol'     │ '0xc0Df603B5424e95c00bF34494B25F38A1c4d2dDb' │
    // │    5    │  'brokerRelay'   │ '0x7e63e0559a16614B999D8C9Fe806A09EAAc39842' │

    // 2021/2/8
    // │    0    │    'governor'    │ '0x02C0526c230392A4C01417e7Df8233F46344C042' │
    // │    1    │ 'shareTokenTmpl' │ '0x02C0526c230392A4C01417e7Df8233F46344C042' │
    // │    2    │  'poolCreator'   │ '0xF55cF7BbaF548115DCea6DF10c57DF7c7eD88b9b' │
    // │    3    │     'symbol'     │ '0x0A701c621210859eAbE2F47BE37456BEc2427462' │
    // │    4    │     'broker'     │ '0x243d3bB879779911a5299592d38e84E54B83fd19' │

    // 4. add version
    // const LiquidityPool = await createLiquidityPoolFactory();
    // var liquidityPoolTmpl = await LiquidityPool.deploy();
    // var governorTmpl = await createContract("LpGovernor");
    // console.table([
    //     ['liquidityPoolTmpl', liquidityPoolTmpl.address],
    //     ["governorTmpl", governorTmpl.address],
    // ]);
    // await (await poolCreator.addVersion(liquidityPoolTmpl.address, governorTmpl.address, 0, "initial version", { gasLimit: 5000000 })).wait();
    // return

    // 5. pools
    // const pool1 = await set1(deployer, poolCreator, oracleAddresses);
    // const pool2 = await set2(deployer, poolCreator, oracleAddresses);

    // 6. reader
    // await deployReader(poolCreator);
}

async function set1(deployer, poolCreator, oracleAddresses) {
    // var eth = await createContract("CustomERC20", ["ETH", "ETH", 18])
    const ETH = "0x025435ACD9A326fA25B4098887b38dD2CeDf6422"
    var eth = await (await createFactory("CustomERC20")).attach(ETH)
    const tx = await (await poolCreator.createLiquidityPool(
        eth.address,
        18,                             /* decimals */
        Math.floor(Date.now() / 1000),  /* nonce */
        // (isFastCreationEnabled, insuranceFundCap, liquidityCap, addLiquidityDelay)
        ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [true, toWei("10000000"), 0, 1])
    )).wait()

    const n = await poolCreator.getLiquidityPoolCount();
    const allLiquidityPools = await poolCreator.listLiquidityPools(0, n.toString());
    const LiquidityPool = await createLiquidityPoolFactory();
    const liquidityPool = await LiquidityPool.attach(allLiquidityPools[allLiquidityPools.length - 1]);

    const mtx1 = await liquidityPool.createPerpetual(
        oracleAddresses["USD - ETH"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper          insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("0.005"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx1.wait()
    const mtx2 = await liquidityPool.createPerpetual(
        oracleAddresses["BTC - ETH"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper          insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("0.005"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx2.wait()
    const addresses = [
        ["ETH", ETH],
        ["  LiquidityPool", `${liquidityPool.address} @ ${tx.blockNumber}`],
        ["  PerpetualStorage 0", `@ ${mtx1.blockNumber}`],
        ["  PerpetualStorage 1", `@ ${mtx2.blockNumber}`],
    ]
    console.table(addresses)

    console.log('run pool')
    await (await liquidityPool.runLiquidityPool()).wait();

    console.log('add liquidity')
    await eth.mint(deployer.address, toWei("6000"));
    await (await eth.approve(liquidityPool.address, toWei("6000"))).wait();
    await liquidityPool.addLiquidity(toWei("6000"));

    return liquidityPool
}

async function set2(deployer, poolCreator, oracleAddresses) {
    // var usdc = await createContract("CustomERC20", ["USDC", "USDC", 6])
    const USDC = "0xd4AC81D9FD2b28363eBD1D88a8364Ff3b3577e84"
    var usd = await (await createFactory("CustomERC20")).attach(USDC)

    const tx = await (await poolCreator.createLiquidityPool(
        usd.address,
        6,                              /* decimals */
        true,                           /* isFastCreationEnabled */
        Math.floor(Date.now() / 1000),  /* nonce */
        // (isFastCreationEnabled, insuranceFundCap)
        ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [true, toWei("10000000"), 0, 1])
    )).wait()

    const n = await poolCreator.getLiquidityPoolCount();
    const allLiquidityPools = await poolCreator.listLiquidityPools(0, n.toString());
    const LiquidityPool = await createLiquidityPoolFactory();
    const liquidityPool = await LiquidityPool.attach(allLiquidityPools[allLiquidityPools.length - 1]);

    const mtx1 = await liquidityPool.createPerpetual(
        oracleAddresses["ETH - USD"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper       insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("10"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx1.wait()
    const mtx2 = await liquidityPool.createPerpetual(
        oracleAddresses["BTC - USD"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper       insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("10"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx2.wait()
    const mtx3 = await liquidityPool.createPerpetual(
        oracleAddresses["DPI - USD"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper       insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("10"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx3.wait()
    const mtx4 = await liquidityPool.createPerpetual(
        oracleAddresses["DOT - USD"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper       insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("10"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx4.wait()
    const mtx5 = await liquidityPool.createPerpetual(
        oracleAddresses["SP500 - USD"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper       insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("10"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx5.wait()
    const mtx6 = await liquidityPool.createPerpetual(
        oracleAddresses["TSLA - USD"],
        // imr          mmr            operatorfr        lpfr              rebate        penalty         keeper       insur          oi
        [toWei("0.04"), toWei("0.02"), toWei("0.00000"), toWei("0.00055"), toWei("0.2"), toWei("0.005"), toWei("10"), toWei("0.25"), toWei("5")],
        // alpha         beta1            beta2             frLimit          lev         maxClose       frFactor       defaultLev
        [toWei("0.0005"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("3"), toWei("0.05"), toWei("0.005"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")]
    )
    await mtx6.wait()
    const addresses = [
        ["Collateral (USDC)", USDC],
        ["LiquidityPool", `${liquidityPool.address} @ ${tx.blockNumber}`],
        ["  PerpetualStorage 0", `@ ${mtx1.blockNumber}`],
        ["  PerpetualStorage 1", `@ ${mtx2.blockNumber}`],
        ["  PerpetualStorage 2", `@ ${mtx3.blockNumber}`],
        ["  PerpetualStorage 3", `@ ${mtx4.blockNumber}`],
        ["  PerpetualStorage 4", `@ ${mtx5.blockNumber}`],
        ["  PerpetualStorage 5", `@ ${mtx6.blockNumber}`],
    ]
    console.table(addresses)

    console.log('run pool')
    await (await liquidityPool.runLiquidityPool()).wait();

    console.log('add liquidity')
    await usd.mint(deployer.address, "10000000" + "000000");
    await (await usd.approve(liquidityPool.address, "10000000" + "000000")).wait();
    await liquidityPool.addLiquidity(toWei("10000000"));

    return liquidityPool
}

async function deployReader(poolCreator) {
    var reader = await createContract("Reader", [poolCreator.address]);
    const addresses = [["Reader", reader.address]]
    console.table(addresses)
    return { reader }
    // 2021 / 1 / 13 koven
    // ┌─────────┬──────────┬──────────────────────────────────────────────┐
    // │ (index) │    0     │                      1                       │
    // ├─────────┼──────────┼──────────────────────────────────────────────┤
    // │    0    │ 'Reader' │ '0x90b24561Ba9cf98dC6bbA3aF0B19442AE37c1fcf' │
    // └─────────┴──────────┴──────────────────────────────────────────────┘
}

ethers.getSigners()
    .then(accounts => main(accounts))
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });