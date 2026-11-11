const ObjectId = require('mongodb').ObjectID;
const _ = require('lodash');

const restrictedRoutes = [
    { route: '/admin/product/new', response: 'redirect' },
    { route: '/admin/product/insert', response: 'redirect' },
    { route: '/admin/product/edit/:id', response: 'redirect' },
    { route: '/admin/product/update', response: 'redirect' },
    { route: '/admin/product/delete', response: 'redirect' },
    { route: '/admin/product/publishedState', response: 'json' },
    { route: '/admin/product/setasmainimage', response: 'json' },
    { route: '/admin/product/deleteimage', response: 'json' },
    { route: '/admin/product/addvariant', response: 'json' },
    { route: '/admin/product/editvariant', response: 'json' },
    { route: '/admin/product/removevariant', response: 'json' },
    { route: '/admin/order/updateorder', response: 'json' },
    { route: '/admin/createApiKey', response: 'json' },
    { route: '/admin/settings/update', response: 'json' },
    { route: '/admin/settings/pages/new', response: 'redirect' },
    { route: '/admin/settings/pages/edit/:page', response: 'redirect' },
    { route: '/admin/settings/pages', response: 'json' },
    { route: '/admin/settings/page', response: 'json' },
    { route: '/admin/settings/page/delete', response: 'json' },
    { route: '/admin/settings/menu/new', response: 'json' },
    { route: '/admin/settings/menu/update', response: 'json' },
    { route: '/admin/settings/menu/delete', response: 'json' },
    { route: '/admin/settings/menu/saveOrder', response: 'json' },
    { route: '/admin/settings/discounts', response: 'redirect' },
    { route: '/admin/settings/discount/new', response: 'redirect' },
    { route: '/admin/settings/discount/edit/:id', response: 'redirect' },
    { route: '/admin/settings/discount/create', response: 'json' },
    { route: '/admin/settings/discount/update', response: 'json' },
    { route: '/admin/settings/discount/delete', response: 'json' },
    { route: '/admin/review/delete', response: 'json' },
    { route: '/admin/file/url', response: 'json' },
    { route: '/admin/file/upload', response: 'json' }
];

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
        try{
            // Revalidate the session user against the DB on each request so a
            // deleted or demoted user does not retain access from a stale session
            const user = await db.users.findOne({ _id: ObjectId(req.session.userId) });
            if(user){
                // Keep the session privileges in sync with the DB record
                req.session.isAdmin = user.isAdmin === true;
                next();
                return;
            }
        }catch(ex){
            // Invalid session user, fall through to clear the session
        }
        // User no longer exists or the session is invalid, clear it and deny access
        req.session.user = null;
        req.session.usersName = null;
        req.session.userId = null;
        req.session.isAdmin = null;
    }
    res.redirect('/admin/login');
};

// Middleware to check for admin access for certain route
const checkAccess = (req, res, next) => {
    // Admins are granted access. API key authenticated requests have
    // already been validated as belonging to an admin user in checkLogin.
    if(req.session.isAdmin === true || req.apiAuthenticated === true){
        next();
        return;
    }

    // Non-admin users are denied access to every route using this middleware.
    // Fail closed: a route missing from restrictedRoutes is still denied,
    // the list only determines the type of the denial response.
    const routeCheck = _.find(restrictedRoutes, { route: req.route.path });
    if(routeCheck && routeCheck.response === 'json'){
        res.status(400).json({ message: 'Unauthorised. Please refer to administrator.' });
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
