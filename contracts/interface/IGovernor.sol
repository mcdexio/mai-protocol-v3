// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.4;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IGovernor {
    function initialize(
        string memory name,
        string memory symbol,
        address minter,
        address target_,
        address poolCreator
    ) external;

    function totalSupply() external view returns (uint256);

    function getTarget() external view returns (address);

    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function balanceOf(address account) external view returns (uint256);
}
