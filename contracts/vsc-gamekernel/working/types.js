export const TransactionDbType = {
  input: 'input',
  output: 'output'
}

export const TransactionContainerV2 = {
  __v: '0.2',
  __t: 'vsc-tx',
  headers: {
    type: TransactionDbType.input,
    nonce: 0,
    required_auths: []
  },
  tx: {}
}
