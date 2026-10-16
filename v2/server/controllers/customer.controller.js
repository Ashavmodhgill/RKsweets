function home(req, res) {
  res.render('customer/views/pages/home', {
    pageTitle: 'RK Sweets',
    account: req.authAccount,
  });
}

function profile(req, res) {
  res.render('customer/views/pages/profile', {
    pageTitle: 'My profile',
    account: req.authAccount,
  });
}

module.exports = { home, profile };
