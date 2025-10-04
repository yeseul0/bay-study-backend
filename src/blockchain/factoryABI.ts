export const FactoryABI = [
  {
    "inputs": [
      { "internalType": "string", "name": "_studyName", "type": "string" },
      { "internalType": "uint256", "name": "_depositAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "_penaltyAmount", "type": "uint256" },
      { "internalType": "address", "name": "_studyAdmin", "type": "address" },
      { "internalType": "uint256", "name": "_studyStartTime", "type": "uint256" },
      { "internalType": "uint256", "name": "_studyEndTime", "type": "uint256" }
    ],
    "name": "createProxy",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getProxies",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "proxyAddress", "type": "address" }
    ],
    "name": "ProxyCreated",
    "type": "event"
  }
];