// SPDX-License-Identifier: GPL
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

interface ILiquidityPool {
    function checkIn() external;

    function transferOperator(address newOperator) external;

    function claimOperator() external;

    function revokeOperator() external;

    function setOracle(uint256 perpetualIndex, address oracle) external;

    function updatePerpetualRiskParameter(uint256 perpetualIndex, int256[9] calldata riskParams)
        external;

    function addAMMKeeper(uint256 perpetualIndex, address keeper) external;

    function removeAMMKeeper(uint256 perpetualIndex, address keeper) external;

    function createPerpetual(
        address oracle,
        int256[9] calldata baseParams,
        int256[9] calldata riskParams,
        int256[9] calldata minRiskParamValues,
        int256[9] calldata maxRiskParamValues
    ) external;

    function runLiquidityPool() external;
}

interface IAuthenticator {
    /**
     * @notice  Check if an account has the given role.
     * @param   role    A bytes32 value generated from keccak256("ROLE_NAME").
     * @param   account The account to be checked.
     * @return  True if the account has already granted permissions for the given role.
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @notice  This should be called from external contract, to test if a account has specified role.

     * @param   role    A bytes32 value generated from keccak256("ROLE_NAME").
     * @param   account The account to be checked.
     * @return  True if the account has already granted permissions for the given role.
     */
    function hasRoleOrAdmin(bytes32 role, address account) external view returns (bool);
}

/**
 * @notice  OperatorProxy is a proxy that can forward transaction with authentication.
 */
contract OperatorProxy is Initializable, ReentrancyGuardUpgradeable {
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant OPERATOR_ADMIN_ROLE = keccak256("OPERATOR_ADMIN_ROLE");

    address public maintainer;

    event WithdrawERC20(address indexed recipient, address indexed token, uint256 amount);

    IAuthenticator public authenticator;

    receive() external payable {
        revert("do not send ether to proxy");
    }

    modifier onlyAdmin() {
        require(authenticator.hasRoleOrAdmin(0, msg.sender), "caller is not authorized");
        _;
    }

    modifier onlyOperatorAdmin() {
        require(
            authenticator.hasRoleOrAdmin(OPERATOR_ADMIN_ROLE, msg.sender),
            "caller is not authorized"
        );
        _;
    }

    /**
     * @notice  Initialize vault contract.
     *
     * @param   authenticator_  The address of authentication controller that can determine who is able to call
     *                          admin interfaces.
     */
    function initialize(address authenticator_) external initializer {
        require(authenticator_ != address(0), "authenticator is the zero address");
        authenticator = IAuthenticator(authenticator_);
    }

    function checkIn(address liquidityPool) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).checkIn();
    }

    function claimOperator(address liquidityPool) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).claimOperator();
    }

    function revokeOperator(address liquidityPool) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).revokeOperator();
    }

    function updatePerpetualRiskParameter(
        address liquidityPool,
        uint256 perpetualIndex,
        int256[9] calldata riskParams
    ) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).updatePerpetualRiskParameter(perpetualIndex, riskParams);
    }

    function addAMMKeeper(
        address liquidityPool,
        uint256 perpetualIndex,
        address keeper
    ) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).addAMMKeeper(perpetualIndex, keeper);
    }

    function removeAMMKeeper(
        address liquidityPool,
        uint256 perpetualIndex,
        address keeper
    ) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).removeAMMKeeper(perpetualIndex, keeper);
    }

    function createPerpetual(
        address liquidityPool,
        address oracle,
        int256[9] calldata baseParams,
        int256[9] calldata riskParams,
        int256[9] calldata minRiskParamValues,
        int256[9] calldata maxRiskParamValues
    ) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).createPerpetual(
            oracle,
            baseParams,
            riskParams,
            minRiskParamValues,
            maxRiskParamValues
        );
    }

    function runLiquidityPool(address liquidityPool) external onlyOperatorAdmin {
        ILiquidityPool(liquidityPool).runLiquidityPool();
    }

    function withdrawERC20(address token, uint256 amount) external onlyOperatorAdmin {
        require(token != address(0), "token is zero address");
        require(amount != 0, "amount is zero");
        IERC20Upgradeable(token).safeTransfer(msg.sender, amount);
        emit WithdrawERC20(msg.sender, token, amount);
    }

    function transferOperator(address liquidityPool, address newOperator) external onlyAdmin {
        ILiquidityPool(liquidityPool).transferOperator(newOperator);
    }
}
