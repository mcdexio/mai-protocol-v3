// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../oracle/mcdex/TunableOracle.sol";

contract TestTunableOracle is TunableOracle {
    uint256 internal timestamp;

    function initialize(
        address tunableOracleRegister_,
        address liquidityPool_,
        address externalOracle_
    ) external virtual override initializer {
        timestamp = block.timestamp;
        TunableOracle.__TunableOracle_init(tunableOracleRegister_, liquidityPool_, externalOracle_);
    }

    function setBlockTimestamp(uint256 newBlockTimestamp) public {
        timestamp = newBlockTimestamp;
    }

    function blockTimestamp() internal view override returns (uint256) {
        return timestamp;
    }
}
