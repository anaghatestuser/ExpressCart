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

// Middleware to check for admin access for certain route.
// Any route mounting this middleware is restricted to admin users:
// it fails closed rather than matching req.route.path against a list.
const checkAccess = (req, res, next) => {
    // Admin API key access is validated in checkLogin
    if(req.apiAuthenticated === true){
        next();
        return;
    }

    // If the user is not an admin, deny access to this route
    if(req.session.isAdmin !== true){
        if(req.method === 'GET'){
            req.session.message = 'Unauthorised. Please refer to administrator.';
            req.session.messageType = 'danger';
            res.redirect('/admin');
            return;
        }
        res.status(400).json({ message: 'Unauthorised. Please refer to administrator.' });
        return;
    }
    next();
};

module.exports = {
    restrict,
    checkLogin,
    checkAccess
};
