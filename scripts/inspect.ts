const hre = require("hardhat");
const chalk = require("chalk");
const ethers = hre.ethers;
const BigNumber = require("bignumber.js");

import { DeploymentOptions } from "./deployer/deployer";
import { readOnlyEnviron } from "./deployer/environ";
import { printError } from "./deployer/utils";

function passOrWarn(title, cond) {
  return cond ? chalk.greenBright(title) : chalk.red(title);
}

const ENV: DeploymentOptions = {
  network: hre.network.name,
  artifactDirectory: "./artifacts/contracts",
  addressOverride: {},
};

async function getContractBlockNumber(deployer) {
  let endBlock = await deployer.ethers.provider.getBlockNumber()
  let beginBlock = endBlock
  for (let i in deployer.deployedContracts) {
    const deployedAt = deployer.deployedContracts[i].deployedAt
    if (typeof deployedAt === 'number') {
      beginBlock = Math.min(beginBlock, deployedAt)
    }
  }
  return { beginBlock, endBlock }
}

const FILTER_LOG_STEP = 5000

async function inspectPoolCreator(deployer) {
  let { beginBlock, endBlock } = await getContractBlockNumber(deployer)

  console.log("====PoolCreator====");
  console.log("address(proxy):", await deployer.addressOf("PoolCreator"));
  const poolCreator = await deployer.getDeployedContract("PoolCreator");
  const poolUpgradeAdmin = await poolCreator.upgradeAdmin();
  console.log("poolUpgradeAdmin (nobody can transfer the owner):", poolUpgradeAdmin);
  var owner = await poolCreator.owner();
  console.log("owner:", owner);
  var implementation = await deployer.getImplementation(await deployer.addressOf("PoolCreator"));
  console.log("implementation:", implementation);
  var upgradeAdmin = await deployer.getAdminOfUpgradableContract(await deployer.addressOf("PoolCreator"));
  console.log("upgradeAdmin:", upgradeAdmin);
  const keepers = await poolCreator.listKeepers(0, 100);
  console.log("whitelist keepers:", keepers);
  /* block too much
  console.log("guardian:");
  for (let i = beginBlock; i < endBlock; i += FILTER_LOG_STEP + 1) {
    let j = Math.min(i + FILTER_LOG_STEP, endBlock);
    var filter = poolCreator.filters.AddGuardian();
    var logs = await poolCreator.queryFilter(filter, i, j);
    for (const log of logs) {
      console.log("    add ", log.args[0]);
    }
    filter = poolCreator.filters.TransferGuardian();
    logs = await poolCreator.queryFilter(filter, i, j);
    for (const log of logs) {
      console.log("    transfer from ", log.args[0], " to ", log.args[0]);
    }
    filter = poolCreator.filters.RenounceGuardian();
    logs = await poolCreator.queryFilter(filter, i, j);
    for (const log of logs) {
      console.log("    renounce ", log.args[0]);
    }
  }
  */
  const vault = await poolCreator.getVault();
  const vaultFeeRate = await poolCreator.getVaultFeeRate();
  console.log("vault:", vault, "vault fee rate:", new BigNumber(vaultFeeRate.toString()).shiftedBy(-18).toFixed());

  console.log("\n====SymbolService====");
  console.log("address(proxy):", await deployer.addressOf("SymbolService"));
  upgradeAdmin = await deployer.getAdminOfUpgradableContract(await deployer.addressOf("SymbolService"));
  console.log("upgradeAdmin:", upgradeAdmin);
  const symbolService = await deployer.getDeployedContract("SymbolService");
  owner = await symbolService.owner();
  console.log("owner:", owner);
  /* block too much
  console.log("whitelist factory:");
  for (let i = beginBlock; i < endBlock; i += FILTER_LOG_STEP) {
    let j = Math.min(i + FILTER_LOG_STEP, endBlock);
    filter = symbolService.filters.AddWhitelistedFactory();
    logs = await symbolService.queryFilter(filter, i, j);
    for (const log of logs) {
      console.log("    add ", log.args[0]);
    }
    filter = symbolService.filters.RemoveWhitelistedFactory();
    logs = await symbolService.queryFilter(filter, i, j);
    for (const log of logs) {
      console.log("    remove ", log.args[0]);
    }
  }
  */

  console.log("\n====MCDEXFoundation pool====");
  const poolAddress = "0xdb282BBaCE4E375fF2901b84Aceb33016d0d663D";
  console.log("address:", poolAddress);
  const pool = await deployer.getContractAt("Getter", poolAddress);
  const data = await pool.getLiquidityPoolInfo();
  console.log("operator:", data.addresses[1]);
  upgradeAdmin = await deployer.getAdminOfUpgradableContract(poolAddress);
  console.log("upgradeAdmin:", upgradeAdmin);

  console.log("\n====MCDEXMultiOracle====");
  const MCDEXMultiOracleAddress = "0x1284c70F0ed8539F450584Ce937267F8C088B4cC";
  console.log("address:", MCDEXMultiOracleAddress);
  const MCDEXMultiOracle = await deployer.getContractAt("MCDEXMultiOracle", MCDEXMultiOracleAddress);
  upgradeAdmin = await deployer.getAdminOfUpgradableContract(MCDEXMultiOracleAddress);
  console.log("upgradeAdmin:", upgradeAdmin);
  implementation = await deployer.getImplementation(MCDEXMultiOracleAddress);
  console.log("implementation:", implementation);
  var role = ethers.constants.HashZero;
  console.log("default admin role (", role, "):");
  var roleMemberCount = await MCDEXMultiOracle.getRoleMemberCount(role);
  for (let i = 0; i < Number(roleMemberCount); i++) {
    console.log("    ", await MCDEXMultiOracle.getRoleMember(role, i));
  }
  role = ethers.utils.solidityKeccak256(["string"], ["PRICE_SETTER_ROLE"]);
  console.log("price setter role (", role, "):");
  roleMemberCount = await MCDEXMultiOracle.getRoleMemberCount(role);
  for (let i = 0; i < Number(roleMemberCount); i++) {
    console.log("    ", await MCDEXMultiOracle.getRoleMember(role, i));
  }
  role = ethers.utils.solidityKeccak256(["string"], ["MARKET_CLOSER_ROLE"]);
  console.log("market closer role (", role, "):");
  roleMemberCount = await MCDEXMultiOracle.getRoleMemberCount(role);
  for (let i = 0; i < Number(roleMemberCount); i++) {
    console.log("    ", await MCDEXMultiOracle.getRoleMember(role, i));
  }
  role = ethers.utils.solidityKeccak256(["string"], ["TERMINATER_ROLE"]);
  console.log("terminater role (", role, "):");
  roleMemberCount = await MCDEXMultiOracle.getRoleMemberCount(role);
  for (let i = 0; i < Number(roleMemberCount); i++) {
    console.log("    ", await MCDEXMultiOracle.getRoleMember(role, i));
  }

  console.log("\n====MCDEXSingleOracle====");
  const UpgradeableBeaconAddress = "0x5FCDfD5634c50CCcEf6275a239207B09Bd0379df";
  const UpgradeableBeacon = await deployer.getContractAt("UpgradeableBeacon", UpgradeableBeaconAddress);
  implementation = await UpgradeableBeacon.implementation();
  console.log("UpgradeableBeacon:");
  console.log("    address:", UpgradeableBeaconAddress);
  console.log("    implementation:", implementation);
  var owner = await UpgradeableBeacon.owner();
  console.log("    owner:", owner);
  const ETHOracleAddress = "0xa04197E5F7971E7AEf78Cf5Ad2bC65aaC1a967Aa";
  console.log("MCDEXSingleOracle:");
  var beacon = await deployer.getBeacon(ETHOracleAddress);
  console.log("    ETH");
  console.log("      address:", ETHOracleAddress);
  console.log("      beacon:", beacon);
  const BTCOracleAddress = "0xcC8A884396a7B3a6e61591D5f8949076Ed0c7353";
  beacon = await deployer.getBeacon(BTCOracleAddress);
  console.log("    BTC");
  console.log("      address:", BTCOracleAddress);
  console.log("      beacon:", beacon);
  const BNBOracleAddress = "0xcE7822A60D78Ae685A602985a978dcAdE249b387";
  beacon = await deployer.getBeacon(BNBOracleAddress);
  console.log("    BNB");
  console.log("      address:", BNBOracleAddress);
  console.log("      beacon:", beacon);
  const SPELLOracleAddress = "0x18f06dAE7AcA5343b9b399Ee2B77A51dF8f444Fc";
  beacon = await deployer.getBeacon(SPELLOracleAddress);
  console.log("    SPELL");
  console.log("      address:", SPELLOracleAddress);
  console.log("      beacon:", beacon);
  const SQUIDOracleAddress = "0x8CbDF855877434cA40CB2bB3089cfE5f8D7abEC6";
  beacon = await deployer.getBeacon(SQUIDOracleAddress);
  console.log("    SQUID");
  console.log("      address:", SQUIDOracleAddress);
  console.log("      beacon:", beacon);

  console.log("\n====TunableOracleRegister====");
  const TunableOracleRegisterAddress = "0x5f2ffBbb40c8FCd7E62f04A70ffe5A039ae25972";
  console.log("address:", TunableOracleRegisterAddress);
  const TunableOracleRegister = await deployer.getContractAt("TunableOracleRegister", TunableOracleRegisterAddress);
  console.log("upgradeAdmin:", await deployer.getAdminOfUpgradableContract(TunableOracleRegister.address));
  console.log("implementation:", await deployer.getImplementation(TunableOracleRegister.address));
  console.log("beacon implementation(for TunableOracle):", await TunableOracleRegister.implementation());
  var role = ethers.constants.HashZero;
  console.log("default admin role (", role, "):");
  var roleMemberCount = await TunableOracleRegister.getRoleMemberCount(role);
  for (let i = 0; i < Number(roleMemberCount); i++) {
    console.log("    ", await TunableOracleRegister.getRoleMember(role, i));
  }
  role = ethers.utils.solidityKeccak256(["string"], ["TERMINATER_ROLE"]);
  console.log("terminater role (", role, "):");
  roleMemberCount = await TunableOracleRegister.getRoleMemberCount(role);
  for (let i = 0; i < Number(roleMemberCount); i++) {
    console.log("    ", await TunableOracleRegister.getRoleMember(role, i));
  }

  for (let tunableOracleAddress of ["0x7a6bee1474069dC81AEaf65799276b9429bED587", "0x285D90D4a30c30AFAE1c8dc3eaeb41Cc23Ed78Bf",
                                    "0x4E9712fC3e6Fc35b7b2155Bb92c11bC0BEd836f1", "0x2bc36B3f8f8E3Db2902Ac8cEF650B687deCE25f6"]) {
    console.log("\n====TunableOracle====", tunableOracleAddress);
    const TunableOracle = await deployer.getContractAt("TunableOracle", tunableOracleAddress);
    console.log("externalOracle:", await TunableOracle.externalOracle());
    console.log("fineTuner:", await TunableOracle.fineTuner());
  }

}

async function main(_, deployer, accounts) {
  await inspectPoolCreator(deployer);
}

ethers
  .getSigners()
  .then((accounts) => readOnlyEnviron(ethers, ENV, main, accounts))
  .then(() => process.exit(0))
  .catch((error) => {
    printError(error);
    process.exit(1);
  });
