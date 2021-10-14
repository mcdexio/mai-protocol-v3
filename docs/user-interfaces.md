# Contract Interfaces

## Pool

```solidity
initialize(address operator, address collateral, uint256 collateralDecimals, address governor, address shareToken, bool isFastCreationEnabled)
```

Initialize the liquidity pool and set up its configuration.

```solidity
createPerpetual(address oracle, int256[9] calldata baseParams, int256[9] calldata riskParams, int256[9] calldata minRiskParamValues, int256[9] calldata maxRiskParamValues)
```

Create a new perpetual of the liquidity pool. The perpetual's collateral must be the same with the liquidity pool's collateral.

- If the isFastCreationEnabled is set to true, the operator can create new perpetual at any time.
- If the isFastCreationEnabled is set to false, the operator can only create when the liquidity pool is not running. The liquidity providers can vote and create new perpetual (if passed) when the liquidity pool is running.

```solidity
runLiquidityPool()
```

After the operator has created the perpetuals he wants to create, he can run the liquidity pool (only he can run). Then the liquidity providers can add liquidity to the liquidity pool and the traders can deposit and trade in the perpetuals.

```solidity
getLiquidityPoolInfo()
```

Get the information of the liquidity pool.

```solidity
getPoolMargin()
```

Get the pool margin of the liquidity pool. Pool margin is how much collateral of the liquidity pool considering AMM's positions of perpetuals.

```solidity
addLiquidity(int256 cashToAdd)
```

Liquidity provider can add collateral to the liquidity pool and get the share tokens when the liquidity pool is running. The share token is the credential and use to get the collateral back when removing liquidity.

```solidity
removeLiquidity(int256 shareToRemove)
```

Liquidity provider can remove liquidity when the liquidity pool is running. He gets the collateral back and his share tokens are redeemed. The more utilization of liquidity, the less collateral returned.

```solidity
getClaimableFee(address claimer)
```

Get claimable fee of the claimer in the liquidity pool.

```solidity
claimFee(address claimer, int256 amount)
```

Claimer claim his claimable fee(collateral) of in the liquidity pool.

```solidity
getClaimableOperatorFee()
```

Get claimable fee of the operator in the liquidity pool.

```solidity
claimOperatorFee()
```

Claim the claimable fee of the operator. Can only called by the operator of the liquidity pool.

```solidity
transferOperator(address newOperator)
```

Transfer the ownership of the liquidity pool to the new operator, call `claimOperator()` next to complete the transfer. Only the operator can transfer. If no operator exisit, the liquidity provider can transfer after proposing a proposal, voting and passing it.

```solidity
claimOperator()
```

Claim the ownership of the liquidity pool to sender. Sender must be transferred the ownership before.

```solidity
revokeOperator()
```

Revoke the operator of the liquidity pool. Can only called by the operator.

```solidity
setLiquidityPoolParameter(bytes32 key, int256 newValue)
```

Change the parameter of the liquidity pool. This can be done only after the liquidity providers propose a proposal, vote and pass it.

## Perpetual

```solidity
getPerpetualInfo(uint256 perpetualIndex)
```

Get the information of the perpetual.

```solidity
deposit(uint256 perpetualIndex, address trader, int256 amount)
```

Deposit collateral to the account in the perpetual. Trader's cash will increase after depositing.

```solidity
withdraw(uint256 perpetualIndex, address trader, int256 amount)
```

Withdraw collateral from the account in the perpetual. Trader's cash will decrease after withdrawing. Trader can withdraw at any time and must be initial margin safe after withdrawing. Initial margin safe means:
- If position is not zero: `cash + index price * position >= max(index price * abs(position) * initial margin rate, keeper gas reward)`
- If position is zero: `cash + index price * position >= 0`

```solidity
trade(uint256 perpetualIndex, address trader, int256 amount, int256 limitPrice, uint256 deadline, address referrer, uint32 flags)
```

Trade in the perpetual. Trader can long or short in the perpetual. Trader must be initial margin safe if opening position and margin safe if closing position. Margin safe means:

- If position is not zero: `cash + index price * position >= keeper gas reward`
- If position is zero: `cash + index price * position >= 0`

```solidity
brokerTrade(bytes memory orderData, int256 amount)
```

Trade in the perpetual by a order, initiated by the broker. The broker gets the gas reward trader deposited before.

```solidity
liquidateByAMM(uint256 perpetualIndex, address trader)
```

When a trader is not maintenance margin safe in the perpetual, he needs to be liquidated.

This method will liquidate the account and AMM takes the position. A part of the penalty belongs to AMM and sender gets the gas reward.

The liquidate price is determined by AMM based on the index price, the same as trading with AMM. Maintenance margin safe means:

- If position is not zero: `cash + index price * position >= max(index price * abs(position) * maintenance margin rate, keeper gas reward)`
- If position is zero: `cash + index price * position >= 0`

```solidity
liquidateByTrader(uint256 perpetualIndex, address trader, int256 amount, int256 limitPrice, uint256 deadline)
```

When a trader is not maintenance margin safe in the perpetual, he needs to be liquidated.

This method will liquidate the account and sender takes the position. A part of the penalty belongs to sender. The liquidate price is the mark price.

```solidity
queryTrade(uint256 perpetualIndex, address trader, int256 amount, address referrer, uint32 flags)

```

Get the update cash amount and the update position amount of trader if trader trades with AMM in the perpetual.

```solidity
getMarginAccount(uint256 perpetualIndex, address trader)
```

Get cash amount and position amount of trader in the perpetual.

```solidity
setEmergencyState(uint256 perpetualIndex)
```

If account of AMM in the perpetual is not maintenance margin safe. Anyone can set the state of the perpetual to "EMERGENCY".

After that the perpetual is not allowed to trade, deposit and withdraw. The price of the perpetual is freezed to the settlement price.

```solidity
forceToSetEmergencyState(uint256 perpetualIndex)
```

Force to set the state of the perpetual to "EMERGENCY".

After that the perpetual is not allowed to trade and the price of the perpetual is freezed to the settlement price.

This can be done only after the liquidity providers propose a proposal, vote and pass it.

```solidity
clear(uint256 perpetualIndex)
```

After the state of the perpetual is set to "EMERGENCY". Anyone can clear an active account in the perpetual and get the gas reward.

If all active accounts are cleared, the clear progress is done and the state of the perpetual is set to "CLEARED".

Active means the trader's account is not empty in the perpetual. Empty means cash and position are zero.

```solidity
getClearProgress(uint256 perpetualIndex)
```

Get the number of all active accounts and the number of active accounts not cleared in the perpetual. This method is usually used to check the clear progress.

```solidity
settle(uint256 perpetualIndex, address trader)
```

If the state of the perpetual is "CLEARED", anyone authorized withdraw privilege by trader can settle trader's account in the perpetual.

Which means to calculate how much the collateral should be returned to the trader, return it to trader's wallet and clear the trader's position in the perpetual.

```solidity
donateInsuranceFund(uint256 perpetualIndex, int256 amount)
```

Donate collateral to the insurance fund of the perpetual when the state of the perpetual is "NORMAL". This operation can improve the security of the perpetual.

```solidity
setPerpetualBaseParameter(uint256 perpetualIndex, bytes32 key, int256 newValue)
```

Change the base parameter of the perpetual. This can be done only after the liquidity providers propose a proposal, vote and pass it.

```solidity
setPerpetualRiskParameter(uint256 perpetualIndex, bytes32 key, int256 newValue, int256 minValue, int256 maxValue)
```

Change the risk parameter of the perpetual, including the minimum value and maximum value. This can be done only after the liquidity providers propose a proposal, vote and pass it.

```solidity
updatePerpetualRiskParameter(uint256 perpetualIndex, bytes32 key, int256 newValue)
```

Change the risk parameter of the perpetual, the value must be between the minimum value and the maximum value. This can be done only by the operator of the liquidity pool.

## Pool creator

```solidity
owner()
```

Get the owner of the pool creator.

```solidity
transferOwnership(address newOwner)
```

Transfer the ownership of the pool creator to a new address. Can only be called by the current owner.

```solidity
renounceOwnership()
```

Leave the pool creator without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner.

```solidity
addVersion(address implementation, uint256 compatibility, string calldata note)
```

Create the implementation of liquidity pool by sender. The implementation should not be created before.

```solidity
isVersionValid(address implementation)
```

Check if the implementation of liquidity pool is created.

```solidity
getLatestVersion()
```

Get the latest created implementation of liquidity pool.

```solidity
getDescription(address implementation)
```

Get the description of the implementation of liquidity pool. Description contains creator, create time, compatibility and note.

```solidity
isVersionCompatible(address target, address base)
```

Check if the implementation of liquidity pool target is compatible with the implementation base. Being compatible means having larger compatibility.

```solidity
listAvailableVersions(uint256 start, uint256 count)
```

Get a certain number of implementations of liquidity pool starting with the index. If there isn't the number of implementations left after the index, returning the rest of implementations.

```solidity
createLiquidityPool(address collateral, uint256 collateralDecimals, bool isFastCreationEnabled, int256 nonce)
```

Create a liquidity pool with the latest implementation. The operator is sender.

```solidity
createLiquidityPoolWith(address implementation, address collateral, uint256 collateralDecimals, bool isFastCreationEnabled, int256 nonce)
```

Create a liquidity pool with the specific implementation. The operator is sender.

```solidity
getLiquidityPoolCount()
```

Get the number of all liquidity pools.

```solidity
isLiquidityPool(address liquidityPool)
```

Check if the liquidity pool exists.

```solidity
listLiquidityPools(uint256 begin, uint256 end)
```

Get the liquidity pools whose index between begin and end.

```solidity
getOwnedLiquidityPoolsCountOf(address operator)
```

Get the number of the liquidity pools owned by the operator.

```solidity
listLiquidityPoolOwnedBy(address operator, uint256 begin, uint256 end)
```

Get the liquidity pools owned by the operator and whose index between begin and end.

```solidity
registerOperatorOfLiquidityPool(address liquidityPool, address operator)
```

Liquidity pool must call this method when changing its ownership to the new operator. Can only be called by a liquidity pool.

```solidity
getActiveLiquidityPoolCountOf(address trader)
```

Get the number of the trader's active liquidity pools. Active means the trader's account is not all empty in perpetuals of the liquidity pool. Empty means cash and position are zero.

```solidity
isActiveLiquidityPoolOf(address trader, address liquidityPool, uint256 perpetualIndex)
```

Check if the perpetual is active for the trader. Active means the trader's account is not empty in the perpetual. Empty means cash and position are zero.

```solidity
function listActiveLiquidityPoolsOf(address trader, uint256 begin, uint256 end)
```

Get the liquidity pools whose index between begin and end and active for the trader. Active means the trader's account is not all empty in perpetuals of the liquidity pool. Empty means cash and position are zero.

```solidity
activatePerpetualFor(address trader, uint256 perpetualIndex)
```

Activate the perpetual for the trader. Active means the trader's account is not empty in the perpetual. Empty means cash and position are zero. Can only called by a liquidity pool.

```solidity
deactivatePerpetualFor(address trader, uint256 perpetualIndex)
```

Deactivate the perpetual for the trader. Active means the trader's account is not empty in the perpetual. Empty means cash and position are zero. Can only called by a liquidity pool.

```solidity
getVault()
```

Get the address of the vault.

```solidity
getVaultFeeRate()
```

Get the vault fee rate.

```solidity
setVaultFeeRate(int256 newVaultFeeRate)
```

Set the vault fee rate. Can only called by vault.

```solidity
getWeth()
```

Get the address of weth.

```solidity
getAccessController()
```

Get the address of the access controller. It's always its own address.

```solidity
getSymbolService()
```

Get the address of the symbol service.

```solidity
grantPrivilege(address grantee, uint256 privilege)
```

Grant the grantee the privilege by sender. There are three kinds of valid privilege: deposit, withdraw, trade

```solidity
revokePrivilege(address grantee, uint256 privilege)
```

Revoke the privilege of the grantee. Can only called by the grantor. There are three kinds of valid privilege: deposit, withdraw, trade

```solidity
isGranted(address grantor, address grantee, uint256 privilege)
```

Check if the grantee is granted the privilege by the grantor. There are three kinds of valid privilege: deposit, withdraw, trade


