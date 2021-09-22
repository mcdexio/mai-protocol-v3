// SPDX-License-Identifier: BUSL-1.1
//
// The 3-Clause BSD License
// Copyright 2020 Compound Labs, Inc.
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../interface/IPoolCreatorFull.sol";
import "../interface/ILiquidityPoolGetter.sol";

/**
 * @notice Possible states that a proposal may be in.
 *
 *         There basically are up to 4 stages for a proposal:
 *           1. Pending:  Period before voter can cast vote.
 *           2. Active:   Period for casting vote.
 *                        Once voted, voter's all governor token will be locked until votingPeriod passed.
 *           3. Defeated / Succeeded:
 *                        For a defeated proposal, voting is done, all governor tokens are will unlock immediately;
 *                        For a succeeded proposal, lock will be extended by `executionDelay` + `unlockDelay`.
 *           4. Queued:   Succeeded proposal can only be executed after an `executionDelay`;
 *           5. Executed: After `executionDelay` a succeeded proposal is able to be called by anyone then marked as 'executed';
 *           6. Expired:  If a proposal succeeded but no one try to execute it, when the `unlockDelay` passed.
 *                        it will be marked as expired and no longer can be executed.
 *
 */
enum ProposalState {
    Pending,
    Active,
    Defeated,
    Succeeded,
    Queued,
    Executed,
    Expired
}

struct Proposal {
    // Unique id for looking up a proposal
    uint256 id;
    address target;
    // Creator of the proposal
    address proposer;
    // The ordered list of function signatures to be called
    string[] signatures;
    // The ordered list of calldata to be passed to each call
    bytes[] calldatas;
    // The block at which voting begins: holders must delegate their votes prior to this block
    uint256 startBlock;
    // The block at which voting ends: votes must be cast prior to this block
    uint256 endBlock;
    // Minimal votes for a proposal to succeed
    uint256 quorumVotes;
    // Current number of votes in favor of this proposal
    uint256 forVotes;
    // Current number of votes in opposition to this proposal
    uint256 againstVotes;
    // Flag marking whether the proposal has been executed
    bool executed;
    // Receipts of ballots for the entire set of voters
    mapping(address => Receipt) receipts;
}

/**
 * @notice Ballot receipt record for a account.
 */
struct Receipt {
    // Whether or not a vote has been cast
    bool hasVoted;
    // Whether or not the account supports the proposal
    bool support;
    // The number of votes the account had, which were cast
    uint256 votes;
}

/**
 * @notice This is a simplify version of 'Compound GovernorAlpha'.
 *         Timelock is integrated into GovernorAlpha.
 */
abstract contract GovernorAlpha is Initializable, ContextUpgradeable {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    bytes4 public constant SIGNATURE_PERPETUAL_UPGRADE_AND_CALL =
        bytes4(keccak256(bytes("upgradeToAndCall(bytes32,bytes,bytes)")));
    bytes4 public constant SIGNATURE_PERPETUAL_SETTLE =
        bytes4(keccak256(bytes("forceToSetEmergencyState(uint256,int256)")));
    bytes4 public constant SIGNATURE_PERPETUAL_TRANSFER_OPERATOR =
        bytes4(keccak256(bytes("transferOperator(address)")));

    IPoolCreatorFull internal _creator;
    address internal _target;
    mapping(address => uint256) internal _voteLocks;
    mapping(address => EnumerableSetUpgradeable.UintSet) internal _supportedProposals;

    /**
     * @notice The total number of proposals.
     */
    uint256 public proposalCount;

    /**
     * @notice The official record of all proposals ever proposed.
     */
    mapping(uint256 => Proposal) public proposals;

    /**
     * @notice The latest proposal for each proposer.
     */
    mapping(address => uint256) public latestProposalIds;

    /**
     * @notice An event emitted when a new proposal is created.
     */
    event ProposalCreated(
        uint256 id,
        address proposer,
        address target,
        string[] signatures,
        bytes[] calldatas,
        uint256 startBlock,
        uint256 endBlock,
        uint256 quorumVotes,
        string description
    );

    /**
     * @notice An event emitted when a proposal is executed.
     */
    event ExecuteTransaction(
        bytes32 indexed txHash,
        address indexed target,
        string signature,
        bytes data,
        uint256 eta
    );

    /**
     * @notice  An event emitted when a vote has been cast on a proposal.
     */
    event VoteCast(address account, uint256 proposalId, bool support, uint256 votes);

    /**
     * @notice  An event emitted when a proposal has been executed in the Timelock.
     */
    event ProposalExecuted(uint256 id);

    function __GovernorAlpha_init_unchained(address target_) internal initializer {
        _target = target_;
        _creator = IPoolCreatorFull(_msgSender());
    }

    function getTarget() public view virtual returns (address) {
        return _target;
    }

    /**
     * @notice  Balance of vote token which must be implemented through inheritance.
     */
    function balanceOf(address account) public view virtual returns (uint256);

    /**
     * @notice  TotalSupply of vote token which must be implemented through inheritance.
     */
    function totalSupply() public view virtual returns (uint256);

    /**
     * @notice The number of votes in support of a proposal required in order for a quorum to be reached
     *         and for a vote to succeed.
     * @dev    [ConfirmBeforeDeployment]
     */
    function quorumRate() public pure virtual returns (uint256) {
        return 1e17;
    }

    /**
     * @notice  The number of votes in support of a proposal required in order for a quorum to be reached
     *          and for a vote to succeed.
     * @dev     [ConfirmBeforeDeployment]
     */
    function criticalQuorumRate() public pure virtual returns (uint256) {
        return 2e17;
    }

    /**
     * @notice  The number of votes required in order for a account to become a proposer.
     * @dev     [ConfirmBeforeDeployment]
     */
    function proposalThresholdRate() public pure virtual returns (uint256) {
        return 1e16;
    }

    /**
     * @notice The maximum number of actions that can be included in a proposal.
     * @dev    [ConfirmBeforeDeployment]
     */
    function proposalMaxOperations() public pure virtual returns (uint256) {
        return 10;
    }

    /**
     * @notice  The delay before voting on a proposal may take place, once proposed.
     *          See `ProposalState` for details;
     * @dev     [ConfirmBeforeDeployment]
     */
    function votingDelay() public pure virtual returns (uint256) {
        return 1;
    }

    /**
     * @notice  The duration of voting on a proposal, in blocks.
     *          See `ProposalState` for details;
     * @dev     [ConfirmBeforeDeployment]
     */
    function votingPeriod() public pure virtual returns (uint256) {
        return 86400;
    }

    /**
     * @notice  The delay before a succeeded proposal being executed (say, proposal in queued state).
     *          See `ProposalState` for details;
     * @dev     [ConfirmBeforeDeployment]
     */
    function executionDelay() public pure virtual returns (uint256) {
        return 57600;
    }

    /**
     * @notice  The duration after a proposal can be executed. See `ProposalState` for details;
     * @dev     [ConfirmBeforeDeployment]
     */
    function unlockDelay() public pure virtual returns (uint256) {
        return 86400;
    }

    function getProposalThreshold() public view virtual returns (uint256) {
        uint256 totalVotes = totalSupply();
        return totalVotes.mul(proposalThresholdRate()).div(1e18);
    }

    function getQuorumVotes(uint256 proposalId) public view virtual returns (uint256) {
        Proposal storage proposal = proposals[proposalId];
        uint256 length = proposal.signatures.length;
        uint256 totalVotes = totalSupply();
        for (uint256 i = 0; i < length; i++) {
            if (isCriticalFunction(proposal.signatures[i])) {
                return totalVotes.mul(criticalQuorumRate()).div(1e18);
            }
        }
        return totalVotes.mul(quorumRate()).div(1e18);
    }

    /**
     * @notice  Return true if a signature matches critical functions, which means a proposal with critical actions
     *          will require more share (governance) token to reach quorum.
     *
     * @param   functionSignature   The string signature of function to test.
     */
    function isCriticalFunction(string memory functionSignature) public pure returns (bool) {
        bytes4 functionHash = bytes4(keccak256(bytes(functionSignature)));
        return
            functionHash == SIGNATURE_PERPETUAL_UPGRADE_AND_CALL ||
            functionHash == SIGNATURE_PERPETUAL_SETTLE ||
            functionHash == SIGNATURE_PERPETUAL_TRANSFER_OPERATOR;
    }

    /**
     * @notice Execute a transaction in 'queue' state.
     *
     & @param   proposalId  The id of proposal to execute.
     */
    function execute(uint256 proposalId) public payable {
        require(
            state(proposalId) == ProposalState.Queued,
            "proposal can only be executed if it is success and queued"
        );
        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;
        for (uint256 i = 0; i < proposal.signatures.length; i++) {
            _executeTransaction(
                proposal.target,
                proposal.signatures[i],
                proposal.calldatas[i],
                proposal.endBlock
            );
        }
        emit ProposalExecuted(proposalId);
    }

    function getActions(uint256 proposalId)
        public
        view
        returns (string[] memory signatures, bytes[] memory calldatas)
    {
        Proposal storage p = proposals[proposalId];
        return (p.signatures, p.calldatas);
    }

    function getReceipt(uint256 proposalId, address account) public view returns (Receipt memory) {
        return proposals[proposalId].receipts[account];
    }

    function state(uint256 proposalId) public view returns (ProposalState) {
        require(proposalCount >= proposalId && proposalId > 0, "invalid proposal id");
        Proposal storage proposal = proposals[proposalId];
        if (block.number <= proposal.startBlock) {
            return ProposalState.Pending;
        } else if (block.number <= proposal.endBlock) {
            return ProposalState.Active;
        } else if (
            proposal.forVotes <= proposal.againstVotes ||
            proposal.forVotes.add(proposal.againstVotes) < proposal.quorumVotes
        ) {
            return ProposalState.Defeated;
        } else if (block.number <= proposal.endBlock.add(executionDelay())) {
            return ProposalState.Succeeded;
        } else if (proposal.executed) {
            return ProposalState.Executed;
        } else if (block.number > proposal.endBlock.add(executionDelay()).add(unlockDelay())) {
            return ProposalState.Expired;
        } else {
            return ProposalState.Queued;
        }
    }

    function propose(
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory description
    ) public virtual returns (uint256) {
        require(signatures.length == calldatas.length, "function information arity mismatch");
        require(signatures.length != 0, "must provide actions");
        require(signatures.length <= proposalMaxOperations(), "too many actions");

        address proposer = _msgSender();
        uint256 proposalId = _createProposal(
            proposer,
            getTarget(),
            signatures,
            calldatas,
            description
        );
        latestProposalIds[proposer] = proposalId;
        _castVote(proposer, proposalId, true);
        return proposalId;
    }

    /**
     * @notice  Since the governor itself is upgradeable too and
     *          the ProxyAdmin is a independent contract controlled by pool creator,
     *          upgrade now is a special proposal.
     *
     * @param   targetVersionKey        The key of target version to be upgrade to.
     * @param   dataForLiquidityPool    A bytes array contains calldata to call a function of new liquidity pool after upgrade.
     *                                  This field will be ignored if left empty.
     * @param   dataForGovernor         A bytes array contains calldata to call a function of new governor after upgrade.
     *                                  This field will be ignored if left empty.
     * @param   description             A description of this proposal, only appears in transaction logs.
     * @return  proposalId              The id of new proposal.
     *
     */
    function proposeToUpgradeAndCall(
        bytes32 targetVersionKey,
        bytes memory dataForLiquidityPool,
        bytes memory dataForGovernor,
        string memory description
    ) public virtual returns (uint256) {
        _validateVersion(targetVersionKey);
        address proposer = _msgSender();
        string[] memory signatures = new string[](1);
        signatures[0] = "upgradeToAndCall(bytes32,bytes,bytes)";
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encode(targetVersionKey, dataForLiquidityPool, dataForGovernor);
        uint256 proposalId = _createProposal(
            proposer,
            address(_creator),
            signatures,
            calldatas,
            description
        );
        latestProposalIds[proposer] = proposalId;
        _castVote(proposer, proposalId, true);
        return proposalId;
    }

    function _validateVersion(bytes32 targetVersionKey) internal view {
        require(_creator.isVersionKeyValid(targetVersionKey), "version to upgrade to is not valid");
        bytes32 baseVersionKey = _creator.getAppliedVersionKey(getTarget(), address(this));
        require(
            _creator.isVersionCompatible(targetVersionKey, baseVersionKey),
            "version to upgrade to is not compatible"
        );
    }

    function _validateProposer(address proposer) internal view {
        address operator = _getOperator();
        if (operator != address(0)) {
            require(proposer == operator, "proposer must be operator when operator exists");
        } else {
            require(balanceOf(proposer) >= getProposalThreshold(), "proposal threshold unmet");
        }
        if (latestProposalIds[proposer] != 0) {
            ProposalState latestProposalState = state(latestProposalIds[proposer]);
            require(latestProposalState != ProposalState.Pending, "last proposal is pending");
            require(latestProposalState != ProposalState.Active, "last proposal is active");
        }
    }

    function _createProposal(
        address proposer,
        address target,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory description
    ) internal returns (uint256) {
        _validateProposer(proposer);

        uint256 startBlock = _getBlockNumber().add(votingDelay());
        uint256 endBlock = startBlock.add(votingPeriod());
        proposalCount++;
        uint256 proposalId = proposalCount;

        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.target = target;
        proposal.proposer = proposer;
        proposal.signatures = signatures;
        proposal.calldatas = calldatas;
        proposal.startBlock = startBlock;
        proposal.endBlock = endBlock;
        uint256 quorumVotes = getQuorumVotes(proposalId);
        proposal.quorumVotes = quorumVotes;

        emit ProposalCreated(
            proposalId,
            proposer,
            target,
            signatures,
            calldatas,
            startBlock,
            endBlock,
            quorumVotes,
            description
        );
        return proposalId;
    }

    function castVote(uint256 proposalId, bool support) public virtual {
        require(state(proposalId) == ProposalState.Active, "voting is closed");
        _castVote(_msgSender(), proposalId, support);
    }

    function isLockedByVoting(address account) public virtual returns (bool) {
        if (account == address(0)) {
            return false;
        }
        return _getBlockNumber() <= _updateVoteLock(account, 0);
    }

    function getUnlockBlock(address account) public view virtual returns (uint256) {
        (uint256 lastUnlockBlock, , ) = _getVoteLock(account);
        return lastUnlockBlock;
    }

    function _getVoteLock(address account)
        internal
        view
        virtual
        returns (
            uint256 lastUnlockBlock,
            uint256 stableProposalCount,
            uint256[] memory stableProposalIds
        )
    {
        lastUnlockBlock = _voteLocks[account];
        EnumerableSetUpgradeable.UintSet storage proposalIds = _supportedProposals[account];
        uint256 length = proposalIds.length();
        if (length > 0) {
            stableProposalIds = new uint256[](length);
            for (uint256 i = 0; i < length; i++) {
                uint256 proposalId = proposalIds.at(i);
                ProposalState proposalState = state(proposalId);
                if (
                    proposalState == ProposalState.Pending || proposalState == ProposalState.Active
                ) {
                    continue;
                }
                if (
                    proposalState == ProposalState.Succeeded ||
                    proposalState == ProposalState.Executed ||
                    proposalState == ProposalState.Queued ||
                    proposalState == ProposalState.Expired
                ) {
                    uint256 unlockBlock = proposals[proposalId].endBlock.add(
                        executionDelay().add(unlockDelay())
                    );
                    if (unlockBlock > lastUnlockBlock) {
                        lastUnlockBlock = unlockBlock;
                    }
                }
                stableProposalIds[stableProposalCount] = proposalId;
                stableProposalCount++;
            }
        }
    }

    function _updateVoteLock(address account, uint256 blockNumber) internal returns (uint256) {
        EnumerableSetUpgradeable.UintSet storage proposalIds = _supportedProposals[account];
        (
            uint256 lastUnlockBlock,
            uint256 stableProposalCount,
            uint256[] memory stableProposalIds
        ) = _getVoteLock(account);
        for (uint256 i = 0; i < stableProposalCount; i++) {
            uint256 proposalId = stableProposalIds[i];
            if (proposalId != 0) {
                proposalIds.remove(proposalId);
            }
        }
        _voteLocks[account] = blockNumber > lastUnlockBlock ? blockNumber : lastUnlockBlock;
        return _voteLocks[account];
    }

    function _castVote(
        address account,
        uint256 proposalId,
        bool support
    ) internal {
        Proposal storage proposal = proposals[proposalId];
        Receipt storage receipt = proposal.receipts[account];
        require(receipt.hasVoted == false, "account already voted");
        uint256 votes = balanceOf(account);
        if (support) {
            proposal.forVotes = proposal.forVotes.add(votes);
        } else {
            proposal.againstVotes = proposal.againstVotes.add(votes);
        }
        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        _updateVoteLock(account, proposal.endBlock.add(1));
        if (support) {
            _supportedProposals[account].add(proposalId);
        }
        emit VoteCast(account, proposalId, support, votes);
    }

    function _getOperator() internal view returns (address) {
        (, , address[7] memory addresses, , ) = ILiquidityPoolGetter(_target)
            .getLiquidityPoolInfo();
        return addresses[1];
    }

    function _executeTransaction(
        address target,
        string memory signature,
        bytes memory data,
        uint256 eta
    ) internal returns (bytes memory) {
        bytes32 txHash = keccak256(abi.encode(target, signature, data, eta));
        uint256 blockNumber = _getBlockNumber();
        require(
            blockNumber >= eta.add(executionDelay()),
            "Transaction hasn't surpassed time lock."
        );
        require(
            blockNumber <= eta.add(executionDelay()).add(unlockDelay()),
            "Transaction is stale."
        );
        bytes memory returnData = target.functionCall(
            abi.encodePacked(bytes4(keccak256(bytes(signature))), data)
        );
        emit ExecuteTransaction(txHash, target, signature, data, eta);
        return returnData;
    }

    function _getBlockNumber() internal view virtual returns (uint256) {
        return block.number;
    }

    bytes32[50] private __gap;
}
