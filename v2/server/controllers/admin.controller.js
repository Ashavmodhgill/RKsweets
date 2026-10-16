function home(req, res) {
  res.render('admin/views/pages/home', {
    pageTitle: 'Admin portal',
    account: req.authAccount,
  });
}

module.exports = { home };
