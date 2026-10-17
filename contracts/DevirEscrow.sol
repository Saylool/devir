// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Fuji-only, owner-attested service-fee escrow. Does NOT control an OKX account.
contract DevirEscrow {
    uint256 public constant CHAIN_ID = 43113;
    struct Job { address owner; address worker; uint256 remaining; uint64 deadline; uint32 epoch; uint16 progress; bool closed; bytes32 checkpoint; }
    mapping(bytes32 => Job) public jobs;
    mapping(address => uint256) public credit;
    event Funded(bytes32 indexed id, address indexed owner, address worker, uint256 amount);
    event Transferred(bytes32 indexed id, address from, address to, uint32 epoch, uint16 progress, bytes32 checkpoint);
    event Closed(bytes32 indexed id, bool completed, bytes32 checkpoint);
    constructor(){ require(block.chainid == CHAIN_ID, "Fuji only"); }
    function jobId(bytes32 taskHash, address owner) public pure returns(bytes32){ return keccak256(abi.encode(taskHash,owner)); }
    function fund(bytes32 taskHash,address worker,uint64 deadline) external payable returns(bytes32 id){
        require(msg.value>0 && msg.value<=1 ether,"Test amount 0-1 AVAX");
        require(worker!=address(0)&&deadline>block.timestamp&&deadline<=block.timestamp+7 days,"Invalid job");
        id=jobId(taskHash,msg.sender);require(jobs[id].owner==address(0),"Already funded");
        jobs[id]=Job(msg.sender,worker,msg.value,deadline,1,0,false,taskHash);
        emit Funded(id,msg.sender,worker,msg.value);
    }
    function handover(bytes32 id,uint32 expectedEpoch,address successor,uint16 acceptedProgress,uint256 successorFee,bytes32 proof) external {
        Job storage j=jobs[id];_authorize(j,expectedEpoch);
        require(block.timestamp<=j.deadline,"Deadline passed");
        require(successor!=address(0)&&successor!=j.worker,"Invalid successor");
        require(acceptedProgress>=j.progress&&acceptedProgress<10000,"Invalid progress");
        require(proof!=bytes32(0),"Missing checkpoint");
        uint256 earned=j.remaining*(acceptedProgress-j.progress)/(10000-j.progress);
        uint256 available=j.remaining-earned;
        require(successorFee>0&&successorFee<=available,"Fee exceeds remainder");
        credit[j.worker]+=earned;credit[j.owner]+=available-successorFee;
        address previous=j.worker;j.worker=successor;j.remaining=successorFee;j.progress=acceptedProgress;j.epoch++;j.checkpoint=proof;
        emit Transferred(id,previous,successor,j.epoch,acceptedProgress,proof);
    }
    function complete(bytes32 id,uint32 expectedEpoch,bytes32 proof) external {
        Job storage j=jobs[id];_authorize(j,expectedEpoch);require(block.timestamp<=j.deadline,"Deadline passed");require(proof!=bytes32(0),"Missing checkpoint");
        credit[j.worker]+=j.remaining;j.remaining=0;j.progress=10000;j.closed=true;j.checkpoint=proof;emit Closed(id,true,proof);
    }
    function refund(bytes32 id,uint32 expectedEpoch) external {
        Job storage j=jobs[id];_authorize(j,expectedEpoch);require(block.timestamp>j.deadline,"Deadline active");
        credit[j.owner]+=j.remaining;j.remaining=0;j.closed=true;emit Closed(id,false,j.checkpoint);
    }
    function withdraw() external {uint256 amount=credit[msg.sender];require(amount>0,"No credit");credit[msg.sender]=0;(bool ok,)=payable(msg.sender).call{value:amount}("");require(ok,"Transfer failed");}
    function _authorize(Job storage j,uint32 expectedEpoch) private view {require(j.owner==msg.sender,"Owner only");require(!j.closed,"Closed");require(j.epoch==expectedEpoch,"Stale epoch");}
}
