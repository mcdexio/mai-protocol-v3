// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.4;

import "./IAccessControl.sol";
import "./IPoolCreator.sol";
import "./ITracer.sol";
import "./IVersionControl.sol";
import "./IVariables.sol";
import "./IKeeperWhitelist.sol";

interface IPoolCreatorFull is
    IPoolCreator,
    ITracer,
    IVersionControl,
    IVariables,
    IAccessControl,
    IKeeperWhitelist
{
    /**
     * @notice Owner of version control.
     */
    function owner() external view override(IVersionControl, IVariables) returns (address);
}
