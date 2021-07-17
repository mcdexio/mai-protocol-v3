// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts/proxy/Proxy.sol";
import "@openzeppelin/contracts/utils/Address.sol";

struct ChainedProxyStorage {
    address[] next;
}

/**
 * @dev ChainedProxy is a chained version of EIP1967 proxy
 *
 * The ChainedProxy uses Transparent Proxy as the storage layer and all logic layers
 * use Proxy pattern which call the function if the logic contract has it or delegatecall
 * the next logic hop.
 */
library ChainedProxy {
    /**
     * @dev The storage slot of the ChainedProxy contract which defines the implementation for this proxy.
     * This is bytes32(uint256(keccak256('eip1967.chain.storage')) - 1)) and is validated in the constructor.
     */
    bytes32 internal constant CHAINED_PROXY_STORAGE_SLOT =
        0x7d64d9a819609fbacde989007c1c053753b68c3b56ddef912de84ba0f732e0a9;

    function chainedProxyStorage() internal pure returns (ChainedProxyStorage storage ds) {
        bytes32 slot = CHAINED_PROXY_STORAGE_SLOT;
        assembly {
            ds.slot := slot
        }
    }

    function next(uint256 index) internal view returns (address) {
        ChainedProxyStorage storage ds = chainedProxyStorage();
        require(index < ds.next.length, "ChainedProxy: out of range");
        return ds.next[index];
    }

    function replace(address[] memory newNextAddresses) internal {
        ChainedProxyStorage storage ds = chainedProxyStorage();
        require(newNextAddresses.length > 0, "next is empty");

        // assign next = newNextAddresses
        for (uint256 i = 0; i < newNextAddresses.length; i++) {
            if (i < ds.next.length) {
                ds.next[i] = newNextAddresses[i];
            } else {
                ds.next.push(newNextAddresses[i]);
            }
        }
        while (ds.next.length > newNextAddresses.length) {
            ds.next.pop();
        }
    }
}
