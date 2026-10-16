function sessionOperation(session, method) {
  return new Promise((resolve, reject) => {
    session[method]((error) => (error ? reject(error) : resolve()));
  });
}

async function establishAuthenticatedSession(req, account) {
  if (!req.session || !account?._id) throw new Error('A session and account identity are required.');
  const diningContext = ['dineInTableId', 'dineInCredentialHash', 'dineInVisitId', 'dineInTableVersion']
    .reduce((context, key) => {
      if (req.session[key]) context[key] = req.session[key];
      return context;
    }, {});
  await sessionOperation(req.session, 'regenerate');
  Object.assign(req.session, diningContext);
  req.session.auth = { accountId: String(account._id) };
  await sessionOperation(req.session, 'save');
}

async function invalidateAuthenticatedSession(req, res, cookieName) {
  if (req.session) await sessionOperation(req.session, 'destroy');
  res.clearCookie(cookieName, { path: '/' });
}

module.exports = { establishAuthenticatedSession, invalidateAuthenticatedSession };
