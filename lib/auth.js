const ObjectId = require('mongodb').ObjectID;

const restrict = (req, res, next) => {
    checkLogin(req, res, next);
};

const checkLogin = async (req, res, next) => {
    const db = req.app.db;
    // if not protecting we check for public pages and don't checkLogin
    if(req.session.needsSetup === true){
        res.redirect('/admin/setup');
        return;
    }

    // If API key, check for a user
    if(req.headers.apikey){
        try{
            const user = await db.users.findOne({
                apiKey: ObjectId(req.headers.apikey),
                isAdmin: true
            });
            if(!user){
                res.status(400).json({ message: 'Access denied' });
                return;
            }
            // Set API authenticated in the req
            req.apiAuthenticated = true;
            next();
            return;
        }catch(ex){
            res.status(400).json({ message: 'Access denied' });
            return;
        }
    }

    if(req.session.user){
        next();
        return;
    }
    res.redirect('/admin/login');
};

// Middleware to check for admin access for certain route
const checkAccess = (req, res, next) => {
    // API key access is only ever granted to admin users
    if(req.apiAuthenticated === true){
        next();
        return;
    }

    // Admin users are granted access
    if(req.session.isAdmin === true){
        next();
        return;
    }

    // Otherwise the user is not an admin and access is denied.
    // Restricted routes with a 'redirect' response are sent to /admin,
    // all others receive a JSON error.
    const routeCheck = _.find(restrictedRoutes, { route: req.route.path });
    if(routeCheck && routeCheck.response === 'redirect'){
        req.session.message = 'Unauthorised. Please refer to administrator.';
        req.session.messageType = 'danger';
        res.redirect('/admin');
        return;
    }
    res.status(400).json({ message: 'Unauthorised. Please refer to administrator.' });
};

module.exports = {
    restrict,
    checkLogin,
    checkAccess
};
