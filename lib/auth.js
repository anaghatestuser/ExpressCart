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

// Middleware to check for admin access. Every route using this middleware
// is an admin-only route, so fail closed: only a verified admin principal
// (an admin session or an API key validated as admin by checkLogin) may pass.
const checkAccess = (req, res, next) => {
    if(req.apiAuthenticated === true || req.session.isAdmin === true){
        next();
        return;
    }
    req.session.message = 'Unauthorised. Please refer to administrator.';
    req.session.messageType = 'danger';
    res.redirect('/admin');
};

module.exports = {
    restrict,
    checkLogin,
    checkAccess
};
