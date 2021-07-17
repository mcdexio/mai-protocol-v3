// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../libraries/SafeMathExt.sol";
import "../libraries/Utils.sol";

contract Tracer {
    using SafeMath for uint256;
    using SafeMathExt for uint256;
    using Utils for EnumerableSetUpgradeable.AddressSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    struct PerpetualUID {
        address liquidityPool;
        uint256 perpetualIndex;
    }

    // liquidity pool address[]
    EnumerableSetUpgradeable.AddressSet internal _liquidityPoolSet;
    // hash(puid) => PerpetualUID {}
    mapping(bytes32 => PerpetualUID) internal _perpetualUIDs;
    // trader => hash(puid) []
    mapping(address => EnumerableSetUpgradeable.Bytes32Set) internal _traderActiveLiquidityPools;
    // operator => address
    mapping(address => EnumerableSetUpgradeable.AddressSet) internal _operatorOwnedLiquidityPools;
    mapping(address => address) internal _liquidityPoolOwners;

    modifier onlyLiquidityPool() {
        require(isLiquidityPool(msg.sender), "caller is not liquidity pool instance");
        _;
    }

    // =========================== Liquidity Pool ===========================
    /**
     * @notice  Get the number of all liquidity pools.
     *
     * @return  uint256 The number of all liquidity pools
     */
    function getLiquidityPoolCount() public view returns (uint256) {
        return _liquidityPoolSet.length();
    }

    /**
     * @notice  Check if the liquidity pool exists.
     *
     * @param   liquidityPool   The address of the liquidity pool.
     * @return  True if the liquidity pool exists.
     */
    function isLiquidityPool(address liquidityPool) public view returns (bool) {
        return _liquidityPoolSet.contains(liquidityPool);
    }

    /**
     * @notice  Get the liquidity pools whose index between begin and end.
     *
     * @param   begin   The begin index.
     * @param   end     The end index.
     * @return  result  An array of liquidity pool addresses whose index between begin and end.
     */
    function listLiquidityPools(uint256 begin, uint256 end)
        public
        view
        returns (address[] memory result)
    {
        result = _liquidityPoolSet.toArray(begin, end);
    }

    /**
     * @notice  Get the number of the liquidity pools owned by the operator.
     *
     * @param   operator    The address of operator.
     * @return  uint256     The number of the liquidity pools owned by the operator.
     */
    function getOwnedLiquidityPoolsCountOf(address operator) public view returns (uint256) {
        return _operatorOwnedLiquidityPools[operator].length();
    }

    /**
     * @notice  Get the liquidity pools owned by the operator and whose index between begin and end.
     *
     * @param   operator    The address of the operator.
     * @param   begin       The begin index.
     * @param   end         The end index.
     * @return  result      The liquidity pools owned by the operator and whose index between begin and end.
     */
    function listLiquidityPoolOwnedBy(
        address operator,
        uint256 begin,
        uint256 end
    ) public view returns (address[] memory result) {
        return _operatorOwnedLiquidityPools[operator].toArray(begin, end);
    }

    /**
     * @notice  Liquidity pool must call this method when changing its ownership to the new operator.
     *          Can only be called by a liquidity pool. This method does not affect 'ownership' or privileges
     *          of operator but only make a record for further query.
     *
     * @param   liquidityPool   The address of the liquidity pool.
     * @param   operator        The address of the new operator, must be different from the old operator.
     */
    function registerOperatorOfLiquidityPool(address liquidityPool, address operator)
        public
        onlyLiquidityPool
    {
        address prevOperator = _liquidityPoolOwners[liquidityPool];
        _operatorOwnedLiquidityPools[prevOperator].remove(liquidityPool);
        _operatorOwnedLiquidityPools[operator].add(liquidityPool);
        _liquidityPoolOwners[liquidityPool] = operator;
    }

    /**
     * @dev     Record the liquidity pool, the liquidity pool should not be recorded before
     *
     * @param   liquidityPool   The address of the liquidity pool.
     * @param   operator        The address of operator.
     */
    function _registerLiquidityPool(address liquidityPool, address operator) internal {
        require(liquidityPool != address(0), "invalid liquidity pool address");
        bool success = _liquidityPoolSet.add(liquidityPool);
        require(success, "liquidity pool exists");
        _operatorOwnedLiquidityPools[operator].add(liquidityPool);
        _liquidityPoolOwners[liquidityPool] = operator;
    }

    // =========================== Active Liquidity Pool of Trader ===========================
    /**
     * @notice  Get the number of the trader's active liquidity pools. Active means the trader's account is
     *          not all empty in perpetuals of the liquidity pool. Empty means cash and position are zero.
     *
     * @param   trader  The address of the trader.
     * @return  Number of the trader's active liquidity pools.
     */
    function getActiveLiquidityPoolCountOf(address trader) public view returns (uint256) {
        return _traderActiveLiquidityPools[trader].length();
    }

    /**
     * @notice  Check if the perpetual is active for the trader. Active means the trader's account is
     *          not empty in the perpetual. Empty means cash and position are zero.
     *
     * @param   trader          The address of the trader.
     * @param   liquidityPool   The address of liquidity pool.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @return  True if the perpetual is active for the trader.
     */
    function isActiveLiquidityPoolOf(
        address trader,
        address liquidityPool,
        uint256 perpetualIndex
    ) public view returns (bool) {
        return
            _traderActiveLiquidityPools[trader].contains(
                _getPerpetualKey(liquidityPool, perpetualIndex)
            );
    }

    /**
     * @notice Get the liquidity pools whose index between begin and end and active for the trader.
     *         Active means the trader's account is not all empty in perpetuals of the liquidity pool.
     *         Empty means cash and position are zero.
     *
     * @param   trader  The address of the trader.
     * @param   begin   The begin index.
     * @param   end     The end index.
     * @return  result  An array of active (non-empty margin account) liquidity pool address and perpetul index.
     */
    function listActiveLiquidityPoolsOf(
        address trader,
        uint256 begin,
        uint256 end
    ) public view returns (PerpetualUID[] memory result) {
        require(end > begin, "begin should be lower than end");
        uint256 length = _traderActiveLiquidityPools[trader].length();
        if (begin >= length) {
            return result;
        }
        uint256 safeEnd = end.min(length);
        result = new PerpetualUID[](safeEnd.sub(begin));
        for (uint256 i = begin; i < safeEnd; i++) {
            result[i.sub(begin)] = _perpetualUIDs[_traderActiveLiquidityPools[trader].at(i)];
        }
        return result;
    }

    /**
     * @notice  Activate the perpetual for the trader. Active means the trader's account is not empty in
     *          the perpetual. Empty means cash and position are zero. Can only called by a liquidity pool.
     *
     * @param   trader          The address of the trader.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @return  True if the activation is successful.
     */
    function activatePerpetualFor(address trader, uint256 perpetualIndex)
        external
        onlyLiquidityPool
        returns (bool)
    {
        bytes32 key = _getPerpetualKey(msg.sender, perpetualIndex);
        if (_perpetualUIDs[key].liquidityPool == address(0)) {
            _perpetualUIDs[key] = PerpetualUID({
                liquidityPool: msg.sender,
                perpetualIndex: perpetualIndex
            });
        }
        return _traderActiveLiquidityPools[trader].add(key);
    }

    /**
     * @notice  Deactivate the perpetual for the trader. Active means the trader's account is not empty in
     *          the perpetual. Empty means cash and position are zero. Can only called by a liquidity pool.
     *
     * @param   trader          The address of the trader.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @return  True if the deactivation is successful.
     */
    function deactivatePerpetualFor(address trader, uint256 perpetualIndex)
        external
        onlyLiquidityPool
        returns (bool)
    {
        return
            _traderActiveLiquidityPools[trader].remove(
                _getPerpetualKey(msg.sender, perpetualIndex)
            );
    }

    // =========================== Active Liquidity Pool of Trader ===========================
    /**
     * @dev     Get the key of the perpetual
     * @param   liquidityPool   The address of the liquidity pool which the perpetual belongs to.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @return  Key hash of the perpetual.
     */
    function _getPerpetualKey(address liquidityPool, uint256 perpetualIndex)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(liquidityPool, perpetualIndex));
    }
}
