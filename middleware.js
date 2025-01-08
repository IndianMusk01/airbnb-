module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.flash('error', 'You must be loged  in to create a new listing!');
        return res.redirect('/login');
    }
    next();
};