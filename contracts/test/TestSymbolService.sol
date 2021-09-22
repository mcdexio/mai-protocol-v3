// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";

import "../module/AMMModule.sol";
import "../module/MarginAccountModule.sol";
import "../module/PerpetualModule.sol";

interface ISymbolService {
    function allocateSymbol(address liquidityPool, uint256 perpetualIndex)
        external
        returns (uint256);

    function assignReservedSymbol(
        address liquidityPool,
        uint256 perpetualIndex,
        uint256 symbol
    ) external;

    function getPerpetualUID(uint256 symbol)
        external
        view
        returns (address liquidityPool, uint256 perpetualIndex);

    function getSymbols(address liquidityPool, uint256 perpetualIndex)
        external
        view
        returns (uint256[] memory symbols);
}

contract TestSymbolService {
    address public factory;
    address public symbolService;

    constructor(address _symbolService) {
        factory = address(this);
        symbolService = _symbolService;
    }

    function allocateSymbol(uint256 perpetualIndex) public returns (uint256) {
        return ISymbolService(symbolService).allocateSymbol(address(this), perpetualIndex);
    }

    function assignReservedSymbol(uint256 perpetualIndex, uint256 symbol) public {
        ISymbolService(symbolService).assignReservedSymbol(address(this), perpetualIndex, symbol);
    }

    function getPerpetualUID(uint256 symbol)
        public
        view
        returns (address liquidityPool, uint256 perpetualIndex)
    {
        return ISymbolService(symbolService).getPerpetualUID(symbol);
    }

    function getSymbols(uint256 perpetualIndex) public view returns (uint256[] memory symbols) {
        return ISymbolService(symbolService).getSymbols(address(this), perpetualIndex);
    }

    function getLiquidityPoolInfo()
        public
        view
        returns (
            bool isRunning,
            bool isFastCreationEnabled,
            address[7] memory addresses,
            int256[5] memory intNums,
            uint256[6] memory uintNums
        )
    {
        addresses[0] = factory;
    }
}
