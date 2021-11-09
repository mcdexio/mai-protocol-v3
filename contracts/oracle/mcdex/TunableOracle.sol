// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "@openzeppelin/contracts/proxy/IBeacon.sol";
import "@openzeppelin/contracts/proxy/BeaconProxy.sol";

import "../../interface/IOracle.sol";
import "../../interface/ILiquidityPoolGetter.sol";
import "../../libraries/SafeMathExt.sol";

/**
 * @dev TunableOracleRegister is managed by MCDEX DAO, who can add some ExternalOracles.
 *      TunableOracle selects one of the registered ExternalOracles and set FineTunedPrice
 *      to improve the precision.
 */
contract TunableOracleRegister is
    Initializable,
    ContextUpgradeable,
    AccessControlUpgradeable,
    IBeacon
{
    struct ExternalOracle {
        bool isAdded;
        bool isTerminated;
        uint64 deviation; // decimals = 18. index price will be truncated to mark price * (1 ± deviation).
        uint64 timeout; // seconds. the effective timespan of FineTunedPrice.
    }

    mapping(address => ExternalOracle) internal _externalOracles;
    bool public isAllTerminated;
    address private _tunableOracleImplementation;
    mapping(address => bool) public tunableOracles;

    event SetExternalOracle(address indexed externalOracle, uint64 deviation, uint64 timeout);
    event Terminated(address indexed externalOracle);
    event AllTerminated();
    event Upgraded(address indexed implementation);
    event TunableOracleCreated(
        address indexed liquidityPool,
        address indexed externalOracle,
        address newOracle
    );

    /**
     * @dev TERMINATER_ROLE can shutdown the oracle service and never online again.
     */
    bytes32 public constant TERMINATER_ROLE = keccak256("TERMINATER_ROLE");

    function initialize() external virtual initializer {
        __TunableOracleRegister_init();
    }

    function __TunableOracleRegister_init() internal initializer {
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __TunableOracleRegister_init_unchained();
    }

    function __TunableOracleRegister_init_unchained() internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(TERMINATER_ROLE, _msgSender());
        _setTunableOracleImplementation(address(new TunableOracle()));
    }

    /**
     * @dev Read an ExternalOracle config.
     */
    function getExternalOracle(address externalOracle)
        external
        view
        returns (ExternalOracle memory)
    {
        return _externalOracles[externalOracle];
    }

    /**
     * @dev The ExternalOracle was shutdown and never online again.
     */
    function isTerminated(address externalOracle) external view returns (bool) {
        ExternalOracle storage m = _externalOracles[externalOracle];
        return isAllTerminated || m.isTerminated;
    }

    /**
     * @dev Beacon implementation of a TunableOracle.
     *
     *      CAUTION: if TunableOracleRegister is proxied by a TransparentUpgradeableProxy,
     *               the ProxyAdmin will get the TunableOracleRegister implementation and
     *               other address will get TunableOracle implementation.
     */
    function implementation() public view virtual override returns (address) {
        return _tunableOracleImplementation;
    }

    /**
     * @dev Anyone can create an TunableOracle.
     */
    function newTunableOracle(address liquidityPool, address externalOracle)
        external
        returns (address)
    {
        BeaconProxy newOracle = new BeaconProxy(
            address(this), // beacon
            abi.encodeWithSignature(
                "initialize(address,address,address)",
                address(this), // register
                liquidityPool,
                externalOracle
            )
        );
        tunableOracles[address(newOracle)] = true;
        emit TunableOracleCreated(liquidityPool, externalOracle, address(newOracle));
        return address(newOracle);
    }

    /**
     * @dev Admin can add or overwrite an ExternalOracle.
     */
    function setExternalOracle(
        address externalOracle,
        uint64 deviation, // decimals = 18
        uint64 timeout
    ) external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "role");
        ExternalOracle storage config = _externalOracles[externalOracle];
        config.isAdded = true;
        config.deviation = deviation;
        config.timeout = timeout;
        emit SetExternalOracle(externalOracle, deviation, timeout);
    }

    /**
     * @dev Admin can upgrade all TunableOracles.
     */
    function upgradeTunableOracle(address newImplementation) public virtual {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "role");
        _setTunableOracleImplementation(newImplementation);
        emit Upgraded(newImplementation);
    }

    /**
     * @dev Terminater can stop an ExternalOracle.
     */
    function setTerminated(address externalOracle) external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(TERMINATER_ROLE, _msgSender()), "role");
        ExternalOracle storage m = _externalOracles[externalOracle];
        m.isTerminated = true;
        emit Terminated(externalOracle);
    }

    /**
     * @dev Terminater can stop all ExternalOracles.
     */
    function setAllTerminated() external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(TERMINATER_ROLE, _msgSender()), "role");
        isAllTerminated = true;
        emit AllTerminated();
    }

    function _setTunableOracleImplementation(address newImplementation) private {
        require(AddressUpgradeable.isContract(newImplementation), "not a contract");
        _tunableOracleImplementation = newImplementation;
    }
}

/**
 * @dev TunableOracle uses an ExternalOracle as MarkPrice and backup IndexPrice (AMM reference price).
 *      IndexPrice can be set by FineTuner unless timeout or given up (released) by FineTuner.
 *
 *      CAUTION: TunableOracle only uses externalOracle.markPrice.
 *
 *               +--------+--------+-----------+--------+---------+--------+
 * FineTunePrice | Price1 |        | (timeout) | Price4 | Release |        |
 *               +--------+--------+-----------+--------+---------+--------+
 * ExternalPrice | Price2 | Price3 |           |        |         | Price5 |
 *               +--------+--------+-----------+--------+---------+--------+
 * IndexPrice    | Price1 | Price1 | Price3    | Price4 | Price3  | Price5 |
 *               +--------+--------+-----------+--------+---------+--------+
 */
contract TunableOracle is Initializable, ContextUpgradeable, IOracle {
    using SignedSafeMathUpgradeable for int256;
    using SafeMathExt for int256;
    using SafeMathExt for uint256;
    using SafeCastUpgradeable for int256;
    using SafeCastUpgradeable for uint256;

    TunableOracleRegister public register;
    ILiquidityPoolGetter public liquidityPool;
    IOracle public externalOracle;

    // in order to save gas
    struct Price {
        int192 price;
        uint64 timestamp;
    }
    Price public externalPrice;
    Price public fineTunedPrice;
    bool public isReleased;
    address public fineTuner;

    event SetFineTuner(address fineTuner);
    event SetPrice(int256 price, uint256 timestamp);
    event Released();

    modifier onlyOperator() {
        require(_msgSender() == _getOperator(), "only Operator");
        _;
    }

    modifier onlyFineTuner() {
        require(_msgSender() == fineTuner, "only FineTuner");
        _;
    }

    function blockTimestamp() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    function initialize(
        address tunableOracleRegister_,
        address liquidityPool_,
        address externalOracle_
    ) external virtual initializer {
        __TunableOracle_init(tunableOracleRegister_, liquidityPool_, externalOracle_);
    }

    function __TunableOracle_init(
        address tunableOracleRegister_,
        address liquidityPool_,
        address externalOracle_
    ) internal initializer {
        __Context_init_unchained();
        __TunableOracle_init_unchained(tunableOracleRegister_, liquidityPool_, externalOracle_);
    }

    function __TunableOracle_init_unchained(
        address tunableOracleRegister_,
        address liquidityPool_,
        address externalOracle_
    ) internal initializer {
        require(AddressUpgradeable.isContract(tunableOracleRegister_), "not a contract");
        require(AddressUpgradeable.isContract(liquidityPool_), "not a contract");
        register = TunableOracleRegister(tunableOracleRegister_);
        liquidityPool = ILiquidityPoolGetter(liquidityPool_);
        externalOracle = IOracle(externalOracle_);

        // must registered
        TunableOracleRegister.ExternalOracle memory config = register.getExternalOracle(
            address(externalOracle)
        );
        require(config.isAdded, "not registered");

        // must have operator
        require(_getOperator() != address(0), "no operator");

        // must not terminated
        require(!register.isTerminated(address(externalOracle)), "terminated");
        require(!externalOracle.isTerminated(), "external terminated");

        // save the initial mark price to make sure everything is working
        _forceUpdateExternalOracle();
    }

    /**
     * @dev Get collateral symbol. Also known as quote.
     */
    function collateral() external view override returns (string memory) {
        return externalOracle.collateral();
    }

    /**
     * @dev Get underlying asset symbol. Also known as base.
     */
    function underlyingAsset() external view override returns (string memory) {
        return externalOracle.underlyingAsset();
    }

    /**
     * @dev Mark price. Used to evaluate the account margin balance and liquidation.
     *
     *      Mark price is always ExternalOracle price.
     *      It does not need to be a TWAP. This name is only for backward compatibility.
     */
    function priceTWAPLong() public override returns (int256, uint256) {
        if (!isTerminated()) {
            _forceUpdateExternalOracle();
        } else {
            // leave the last price unchanged
        }
        return (externalPrice.price, externalPrice.timestamp);
    }

    /**
     * @dev Index price. It is AMM reference price.
     *
     *      It does not need to be a TWAP. This name is only for backward compatibility.
     */
    function priceTWAPShort() external override returns (int256, uint256) {
        // update external
        bool isTerminated_ = isTerminated();
        if (!isTerminated_) {
            _forceUpdateExternalOracle();
        } else {
            // leave the last price unchanged
        }
        int256 markPrice = int256(externalPrice.price);

        // pause the timestamp if terminated
        uint256 currentTime;
        if (!isTerminated_) {
            currentTime = blockTimestamp();
        } else {
            currentTime = uint256(externalPrice.timestamp).max(uint256(fineTunedPrice.timestamp));
        }

        // use ExternalOracle
        TunableOracleRegister.ExternalOracle memory config = register.getExternalOracle(
            address(externalOracle)
        );
        uint256 timeToDie = uint256(fineTunedPrice.timestamp) + uint256(config.timeout);
        if (currentTime >= timeToDie || isReleased) {
            return (
                markPrice,
                // time can not turn back
                uint256(externalPrice.timestamp).max(currentTime)
            );
        }

        // use FineTuner
        int256 width = int256(config.deviation).wmul(markPrice);
        int256 price = int256(fineTunedPrice.price);
        price = price.min(markPrice.add(width));
        price = price.max(markPrice.sub(width));
        return (price, fineTunedPrice.timestamp);
    }

    /**
     * @dev The market is closed if the market is not in its regular trading period.
     */
    function isMarketClosed() external override returns (bool) {
        return externalOracle.isMarketClosed();
    }

    /**
     * @dev The oracle service was shutdown and never online again.
     */
    function isTerminated() public override returns (bool) {
        return register.isTerminated(address(externalOracle)) || externalOracle.isTerminated();
    }

    /**
     * @dev Operator can grant a FineTuner.
     */
    function setFineTuner(address newFineTuner) external onlyOperator {
        require(fineTuner != newFineTuner, "already set");
        fineTuner = newFineTuner;
        emit SetFineTuner(newFineTuner);
    }

    /**
     * @dev FineTuner can set price.
     *
     *      Implies timestamp = block.timestamp.
     */
    function setPrice(int256 newPrice) external onlyFineTuner {
        require(newPrice > 0, "price <= 0");
        require(!isTerminated(), "terminated");
        uint256 currentTime = blockTimestamp();
        fineTunedPrice = Price(_toInt192(newPrice), currentTime.toUint64());
        isReleased = false;
        emit SetPrice(newPrice, currentTime);
    }

    /**
     * @dev FineTuner can give up the FineTunedPrice.
     */
    function release() external onlyFineTuner {
        require(!isTerminated(), "terminated");
        isReleased = true;
        emit Released();
    }

    function _getOperator() internal view returns (address) {
        address[7] memory poolAddresses;
        uint256[6] memory uintNums;
        (, , poolAddresses, , uintNums) = liquidityPool.getLiquidityPoolInfo();
        return
            blockTimestamp() <= uintNums[3] /* operatorExpiration */
                ? poolAddresses[1] /* operator */
                : address(0);
    }

    function _forceUpdateExternalOracle() internal {
        (int256 p, uint256 t) = externalOracle.priceTWAPLong();
        require(p > 0, "external price <= 0");
        require(t > 0, "external time = 0");
        require(externalPrice.timestamp <= t, "external time reversed");
        // truncate timestamp to block.timestamp, so that when FineTuner sets price,
        // FineTuned price timestamp will >= markPrice.timestamp.
        t = t.min(blockTimestamp());
        externalPrice = Price(_toInt192(p), t.toUint64());
    }

    function _toInt192(int256 value) internal pure returns (int192) {
        require(value >= -2**191 && value < 2**191, "can not fit in int192");
        return int192(value);
    }
}

/**
 * @dev A simple tool to call setPrice of multiple TunableOracles.
 */
contract MultiTunableOracleSetter is
    Initializable,
    ContextUpgradeable,
    AccessControlUpgradeable
{
    mapping(uint32 => address) public tunableOracles;

    event SetTunableOracle(uint32 indexed id, address tunableOracle);
    
    /**
     * @dev FINE_TUNER_ROLE can set price.
     */
    bytes32 public constant FINE_TUNER_ROLE = keccak256("FINE_TUNER_ROLE");

    function initialize() external virtual initializer {
        __MultiTunableOracleSetter_init();
    }

    function __MultiTunableOracleSetter_init() internal initializer {
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __MultiTunableOracleSetter_init_unchained();
    }

    function __MultiTunableOracleSetter_init_unchained() internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(FINE_TUNER_ROLE, _msgSender());
    }

    /**
     * @dev Admin can refer an id to a TunableOracle.
     */
    function setOracle(
        uint32 id,
        address tunableOracle
    ) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "role");
        tunableOracles[id] = tunableOracle;
        emit SetTunableOracle(id, tunableOracle);
    }

    /**
     * @dev FineTuner can set prices.
     *
     * @param price1 is a packed structure.
     *         255     224 223         192 191           0
     *        +-----------+---------------+---------------+
     *        | id 32bits | unused 32bits | price 192bits |
     *        +-----------+---------------+---------------+
     */
    function setPrice1(bytes32 price1) external {
        require(hasRole(FINE_TUNER_ROLE, _msgSender()), "role");
        _setPrice(price1);
    }

    function setPrice2(bytes32 price1, bytes32 price2) external {
        require(hasRole(FINE_TUNER_ROLE, _msgSender()), "role");
        _setPrice(price1);
        _setPrice(price2);
    }

    function setPrices(bytes32[] memory prices) external {
        require(hasRole(FINE_TUNER_ROLE, _msgSender()), "role");
        for (uint256 i = 0; i < prices.length; i++) {
            _setPrice(prices[i]);
        }
    }

    function _setPrice(bytes32 price1) internal {
        uint32 id = uint32(uint256(price1) >> 224);
        int192 price = int192(uint256(price1));
        TunableOracle oracle = TunableOracle(tunableOracles[id]);
        require(oracle != TunableOracle(0), "unregistered");
        oracle.setPrice(price);
    }
}
