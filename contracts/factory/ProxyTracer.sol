// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../libraries/EnumerableMap.sol";
import "../libraries/SafeCastExt.sol";

contract ProxyTracer {
    using SafeMath for uint256;
    using SafeCastExt for address;
    using SafeCastExt for bytes32;
    using EnumerableMap for EnumerableMap.GenericEnumerableMap;

    // address of proxy => struct {
    //     address of proxy
    //     address of implementation
    // }
    EnumerableMap.GenericEnumerableMap internal _proxyInstances;

    function _registerInstance(address proxy, address implementation) internal {
        require(proxy != address(0), "invalid proxy");
        require(implementation != address(0), "invalid implementation");

        bool notExist = _proxyInstances.set(proxy.toBytes32(), implementation.toBytes32());
        require(notExist, "duplicated");
    }

    function _updateInstance(address proxy, address newImplementation) internal {
        require(proxy != address(0), "invalid proxy");
        require(newImplementation != address(0), "invalid implementation");

        bool notExist = _proxyInstances.set(proxy.toBytes32(), newImplementation.toBytes32());
        require(!notExist, "not exist");
    }

    function _instanceCount() internal view returns (uint256) {
        return _proxyInstances.length();
    }

    function _listInstances(uint256 begin, uint256 end) internal view returns (address[] memory) {
        require(end < _proxyInstances.length(), "exceeded");
        require(end > begin, "0 length");

        address[] memory slice = new address[](end.sub(begin));
        for (uint256 i = begin; i < end; i++) {
            slice[i.sub(begin)] = _proxyInstances.keyAt(i).toAddress();
        }
        return slice;
    }
}