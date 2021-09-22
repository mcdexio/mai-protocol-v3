// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockPoolCreator is Ownable {
    address mcb;

    constructor(address owner_, address mcb_) Ownable() {
        transferOwnership(owner_);
        mcb = mcb_;
    }

    function getMCBToken() public view returns (address) {
        return mcb;
    }
}
