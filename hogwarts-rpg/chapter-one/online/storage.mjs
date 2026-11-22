// D1 batch is atomic. The CHECK guard aborts the entire batch if ANY observed
// revision changed. Character balances, room outcomes and the replay receipt
// therefore commit together, including rewards belonging to other accounts.
export async function readAccount(db, accountId, now) {
 let row = await db.prepare('SELECT revision,state FROM stone_accounts WHERE account_id=?').bind(accountId).first();
 if (!row) {
  await db.prepare('INSERT INTO stone_accounts(account_id,revision,state,updated_at) VALUES(?,0,?,?) ON CONFLICT(account_id) DO NOTHING')
   .bind(accountId,JSON.stringify({accountId,characters:[]}),now).run();
  row = await db.prepare('SELECT revision,state FROM stone_accounts WHERE account_id=?').bind(accountId).first();
 }
 return { id:accountId,revision:row.revision,state:JSON.parse(row.state),original:row.state };
}
export async function readRoom(db, code) {
 const row = await db.prepare('SELECT revision,state FROM stone_rooms WHERE code=?').bind(code).first();
 return row ? { id:code,revision:row.revision,state:JSON.parse(row.state),original:row.state } : null;
}
export async function readReceipt(db, accountId, requestId) {
 return db.prepare('SELECT payload_hash,response FROM stone_receipts WHERE account_id=? AND request_id=?').bind(accountId,requestId).first();
}
export async function commit(db, accounts, room, receipt, now) {
 const writes=accounts.filter(a=>JSON.stringify(a.state)!==a.original);
 const roomChanged=room&&JSON.stringify(room.state)!==room.original;
 if (!writes.length&&!roomChanged&&!receipt) return;
 const predicates=[],binds=[];
 for(const row of accounts){predicates.push('EXISTS(SELECT 1 FROM stone_accounts WHERE account_id=? AND revision=?)');binds.push(row.id,row.revision);}
 if(room){
  if(room.revision===null){predicates.push('NOT EXISTS(SELECT 1 FROM stone_rooms WHERE code=?)');binds.push(room.id);}
  else{predicates.push('EXISTS(SELECT 1 FROM stone_rooms WHERE code=? AND revision=?)');binds.push(room.id,room.revision);}
 }
 const tx=crypto.randomUUID();
 const statements=[db.prepare(`INSERT INTO stone_commit_guard(transaction_id,valid) SELECT ?,CASE WHEN ${predicates.join(' AND ')||'1'} THEN 1 ELSE 0 END`).bind(tx,...binds)];
 for(const row of writes)statements.push(db.prepare('UPDATE stone_accounts SET revision=revision+1,state=?,updated_at=? WHERE account_id=?').bind(JSON.stringify(row.state),now,row.id));
 if(roomChanged){
  if(room.revision===null)statements.push(db.prepare('INSERT INTO stone_rooms(code,revision,state,updated_at) VALUES(?,0,?,?)').bind(room.id,JSON.stringify(room.state),now));
  else statements.push(db.prepare('UPDATE stone_rooms SET revision=revision+1,state=?,updated_at=? WHERE code=?').bind(JSON.stringify(room.state),now,room.id));
 }
 if(receipt)statements.push(db.prepare('INSERT INTO stone_receipts(account_id,request_id,payload_hash,response,created_at) VALUES(?,?,?,?,?)').bind(receipt.accountId,receipt.requestId,receipt.hash,JSON.stringify(receipt.response),now));
 statements.push(db.prepare('DELETE FROM stone_commit_guard WHERE transaction_id=?').bind(tx));
 await db.batch(statements);
}
