// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "./module/PerpetualModule.sol";
import "./Type.sol";
import "./Storage.sol";

import "./interface/ILiquidityPoolGovernance.sol";

// @title Governance is the contract to maintain liquidityPool parameters.
contract Governance is Storage, ILiquidityPoolGovernance {
    using SafeMathUpgradeable for uint256;
    using PerpetualModule for PerpetualStorage;
    using MarginAccountModule for PerpetualStorage;
    using LiquidityPoolModule for LiquidityPoolStorage;
    using LiquidityPoolModule2 for LiquidityPoolStorage;

    modifier onlyGovernor() {
        require(_msgSender() == _liquidityPool.governor, "only governor is allowed");
        _;
    }

    modifier onlyOperator() {
        require(_msgSender() == _liquidityPool.getOperator(), "only operator is allowed");
        _;
    }

    modifier onlyOperatorOrGovernor() {
        address operator = _liquidityPool.getOperator();
        if (operator != address(0)) {
            // has operator
            require(_msgSender() == operator, "can only be initiated by operator");
        } else {
            require(_msgSender() == _liquidityPool.governor, "can only be initiated by governor");
        }
        _;
    }

    /**
        @notice
     */
    function checkIn() public onlyOperator {
        _liquidityPool.checkIn();
    }

    /**
     * @notice  Use in a two phase operator transfer design:
     *            1. transfer operator to new operator;
     *            2. new operator claim to finish transfer.
     *          Before claimOperator is called, operator wil remain to be the previous address.
     *
     *          There are condition when calling transferring operator:
     *            1. when operator exists, only operator is able to call transfer;
     *            2. when operator not exists, call should be from a succeeded governor proposal.
     * @param   newOperator The address of new operator to transfer to.
     */
    function transferOperator(address newOperator) external onlyOperatorOrGovernor {
        require(newOperator != address(0), "new operator is zero address");
        _liquidityPool.transferOperator(newOperator);
    }

    /**
     * @notice  Claim the ownership of the liquidity pool to sender. See `transferOperator` for details.
     *          The caller must be the one specified by `transferOperator` first.
     */
    function claimOperator() public {
        _liquidityPool.claimOperator(_msgSender());
    }

    /**
     * @notice  Revoke the operator of the liquidity pool. Can only called by the operator.
     */
    function revokeOperator() public onlyOperator {
        _liquidityPool.revokeOperator();
    }

    /**
     * @notice  Set the parameter of the liquidity pool. Can only called by the governor.
     * @param   params  New values of parameter set.
     */
    function setLiquidityPoolParameter(int256[4] calldata params) public onlyGovernor {
        _liquidityPool.setLiquidityPoolParameter(params);
    }

    function setOracle(uint256 perpetualIndex, address oracle) public onlyGovernor {
        _liquidityPool.setPerpetualOracle(perpetualIndex, oracle);
    }

    /**
     * @notice  Set the base parameter of the perpetual. Can only called by the governor.
     * @param   perpetualIndex  The index of the perpetual in liquidity pool.
     * @param   baseParams      Values of new base parameter set
     */
    function setPerpetualBaseParameter(uint256 perpetualIndex, int256[9] calldata baseParams)
        public
        onlyGovernor
    {
        _liquidityPool.setPerpetualBaseParameter(perpetualIndex, baseParams);
    }

    /**
     * @notice  Set the risk parameter and adjust range of the perpetual. Can only called by the governor.
     * @param   perpetualIndex      The index of the perpetual in liquidity pool.
     * @param   riskParams          Values of new risk parameter set, each should be within range of related [min, max].
     * @param   minRiskParamValues  Min values of new risk parameter.
     * @param   maxRiskParamValues  Max values of new risk parameter.
     */
    function setPerpetualRiskParameter(
        uint256 perpetualIndex,
        int256[8] calldata riskParams,
        int256[8] calldata minRiskParamValues,
        int256[8] calldata maxRiskParamValues
    ) external onlyGovernor {
        _liquidityPool.setPerpetualRiskParameter(
            perpetualIndex,
            riskParams,
            minRiskParamValues,
            maxRiskParamValues
        );
    }

    /**
     * @notice  Update the risk parameter of the perpetual. Can only called by the operator
     * @param   perpetualIndex  The index of the perpetual in liquidity pool.
     * @param   riskParams      The new value of the risk parameter, must between minimum value and maximum value
     */
    function updatePerpetualRiskParameter(uint256 perpetualIndex, int256[8] calldata riskParams)
        external
        onlyOperator
    {
        _liquidityPool.updatePerpetualRiskParameter(perpetualIndex, riskParams);
    }

    /**
     * @dev     Add an account to the whitelist, accounts in the whitelist is allowed to call `liquidateByAMM`.
     *          If never called, the whitelist in poolCreator will be used instead.
     *          Once called, the local whitelist will be used and the the whitelist in poolCreator will be ignored.
     *
     * @param   keeper          The account of keeper.
     * @param   perpetualIndex  The index of perpetual in the liquidity pool
     */
    function addAMMKeeper(uint256 perpetualIndex, address keeper) external onlyOperatorOrGovernor {
        _liquidityPool.addAMMKeeper(perpetualIndex, keeper);
    }

    /**
     * @dev     Remove an account from the `liquidateByAMM` whitelist.
     *
     * @param   keeper          The account of keeper.
     * @param   perpetualIndex  The index of perpetual in the liquidity pool
     */
    function removeAMMKeeper(uint256 perpetualIndex, address keeper)
        external
        onlyOperatorOrGovernor
    {
        _liquidityPool.removeAMMKeeper(perpetualIndex, keeper);
    }

    /**
     * @notice  Force to set the state of the perpetual to "EMERGENCY" and set the settlement price.
     *          Can only called by the governor.
     * @param   perpetualIndex  The index of the perpetual in liquidity pool.
     */
    function forceToSetEmergencyState(uint256 perpetualIndex, int256 settlementPrice)
        external
        syncState(true)
        onlyGovernor
    {
        require(settlementPrice >= 0, "negative settlement price");
        OraclePriceData memory settlementPriceData = OraclePriceData({
            price: settlementPrice,
            time: block.timestamp
        });
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        perpetual.markPriceData = settlementPriceData;
        perpetual.indexPriceData = settlementPriceData;
        _liquidityPool.setEmergencyState(perpetualIndex);
    }

    /**
     * @notice  Set perpetual into "EMERGENCY" state.
     *          1. if the oracle contract declares itself as "terminated", call setEmergencyState(index).
     *          2. if the AMM is maintenance margin unsafe, call
     *             setEmergencyState(SET_ALL_PERPETUALS_TO_EMERGENCY_STATE).
     * @param   perpetualIndex  The index of the perpetual in liquidity pool or
     *                          SET_ALL_PERPETUALS_TO_EMERGENCY_STATE to settle the whole pool
     */
    function setEmergencyState(uint256 perpetualIndex) public override syncState(true) {
        if (perpetualIndex == Constant.SET_ALL_PERPETUALS_TO_EMERGENCY_STATE) {
            _liquidityPool.setAllPerpetualsToEmergencyState();
        } else {
            PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
            require(IOracle(perpetual.oracle).isTerminated(), "prerequisite not met");
            _liquidityPool.setEmergencyState(perpetualIndex);
        }
    }

    bytes32[50] private __gap;
}
