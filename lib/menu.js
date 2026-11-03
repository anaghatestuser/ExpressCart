const _ = require('lodash');

const getMenu = (db) => {
    return db.menu.findOne({});
};

// Sanitize a menu link so only safe URLs are persisted. Links without a
// scheme (relative paths, anchors, protocol-relative) and links with a
// safe scheme (http, https, mailto, tel) are kept; links with any other
// scheme (e.g. javascript:, data:, vbscript:) are neutralized so they
// cannot execute when rendered into the href of the storefront menu.
const sanitizeLink = (link) => {
    if(typeof link !== 'string'){
        return '';
    }
    const trimmed = link.trim();
    // Determine the scheme the way a browser would: strip spaces and
    // control chars first, as URL parsers ignore them in the scheme
    const compact = trimmed.split('').filter((c) => c > ' ').join('');
    const scheme = compact.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if(scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])){
        return '#';
    }
    return trimmed;
};

// creates a new menu item
const newMenu = (req) => {
    const db = req.app.db;
    return getMenu(db)
    .then((menu) => {
        // if no menu present
        if(!menu){
            menu = {};
            menu.items = [];
        }
        const newNav = {
            title: req.body.navMenu,
            link: sanitizeLink(req.body.navLink),
            order: Object.keys(menu.items).length + 1
        };

        menu.items.push(newNav);
        return db.menu.updateOne({}, { $set: { items: menu.items } }, { upsert: true })
        .then(() => {
            return true;
        });
    })
    .catch((err) => {
        console.log('Error creating new menu', err);
        return false;
    });
};

// delete a menu item
const deleteMenu = (req, menuIndex) => {
    const db = req.app.db;
    return getMenu(db)
    .then((menu) => {
        // Remove menu item
        menu.items.splice(menuIndex, 1);
        return db.menu.updateOne({}, { $set: { items: menu.items } }, { upsert: true })
        .then(() => {
            return true;
        });
    })
    .catch(() => {
        return false;
    });
};

// updates and existing menu item
const updateMenu = (req) => {
    const db = req.app.db;
    return getMenu(db)
    .then((menu) => {
        // find menu item and update it
        const menuIndex = _.findIndex(menu.items, ['title', req.body.navId]);
        menu.items[menuIndex].title = req.body.navMenu;
        menu.items[menuIndex].link = sanitizeLink(req.body.navLink);
        return db.menu.updateOne({}, { $set: { items: menu.items } }, { upsert: true })
        .then(() => {
            return true;
        });
    })
    .catch(() => {
        return false;
    });
};

const sortMenu = (menu) => {
    if(menu && menu.items){
        menu.items = _.sortBy(menu.items, 'order');
        return menu;
    }
    return {};
};

// orders the menu
const orderMenu = (req, res) => {
    const db = req.app.db;
    return getMenu(db)
    .then((menu) => {
        const menuOrder = req.body['order[]'];
        // update the order
        for(let i = 0; i < menuOrder.length; i++){
            _.find(menu.items, ['title', menuOrder[i]]).order = i;
        }
        return db.menu.updateOne({}, { $set: { items: menu.items } }, { upsert: true })
        .then(() => {
            return true;
        });
    })
    .catch(() => {
        return false;
    });
};

module.exports = {
    getMenu,
    newMenu,
    deleteMenu,
    updateMenu,
    sortMenu,
    orderMenu
};
