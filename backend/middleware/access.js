// Checks whether a user may read or write a specific ticket.
// Admins pass automatically. Non-admins must be the ticket's task_owner
// or have an explicit visibility grant targeting the ticket's owner.
async function canAccessTicket(pool, userId, userRole, ticketId) {
  if (userRole === 'admin') return true;
  const { rows } = await pool.query(
    `SELECT 1 FROM tickets t
     WHERE t.id = $1
       AND (
         t.task_owner_id = $2
         OR EXISTS (
           SELECT 1 FROM user_visibility_grants
           WHERE viewer_id = $2
             AND target_id = t.task_owner_id
         )
       )`,
    [ticketId, userId]
  );
  return rows.length > 0;
}

module.exports = { canAccessTicket };
