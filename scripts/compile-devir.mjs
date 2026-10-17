import fs from 'node:fs';
import solc from 'solc';
const source=fs.readFileSync('contracts/DevirEscrow.sol','utf8');
const input={language:'Solidity',sources:{'DevirEscrow.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',metadata:{bytecodeHash:'none'},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input)));
for(const error of output.errors??[])if(error.severity==='error')throw new Error(error.formattedMessage);
const c=output.contracts['DevirEscrow.sol'].DevirEscrow;
fs.mkdirSync('lib/devir/generated',{recursive:true});fs.writeFileSync('lib/devir/generated/escrow.json',JSON.stringify({contractName:'DevirEscrow',compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object},null,2)+'\n');
fs.writeFileSync('public/DevirEscrow.sol',source);console.log('DevirEscrow compiled: '+c.evm.bytecode.object.length/2+' bytes.');
