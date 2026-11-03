const _ = require('lodash');

const getMenu = (db) => {
    return db.menu.findOne({});
};

// Validates a menu link before it is stored. Menu links are rendered
// verbatim into href attributes on every public page (Handlebars escapes
// HTML entities but not URI schemes), so only relative URLs and absolute
// URLs with a safe scheme are allowed; active-content schemes such as
// javascript:, data: or vbscript: are rejected.
const isValidMenuLink = (link) => {
    if(typeof link !== 'string' || link.trim() === ''){
        return false;
    }
    // Browsers strip ASCII whitespace/control characters when extracting a
    // URL scheme (e.g. `java\tscript:`), so strip them before checking.
    // eslint-disable-next-line no-control-regex
    const compact = link.replace(/[\u0000-\u0020]/g, '');
    const scheme = compact.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if(scheme && !['http', 'https', 'mailto'].includes(scheme[1].toLowerCase())){
        return false;
    }
    return true;
};

// creates a new menu item
const newMenu = (req) => {
    const db = req.app.db;
    if(!isValidMenuLink(req.body.navLink)){
        return false;
    }
    return getMenu(db)
    .then((menu) => {
        // if no menu present
        if(!menu){
            menu = {};
            menu.items = [];
        }
        const newNav = {
            title: req.body.navMenu,
            link: req.body.navLink,
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
    if(!isValidMenuLink(req.body.navLink)){
        return false;
    }
    return getMenu(db)
    .then((menu) => {
        // find menu item and update it
        const menuIndex = _.findIndex(menu.items, ['title', req.body.navId]);
        menu.items[menuIndex].title = req.body.navMenu;
        menu.items[menuIndex].link = req.body.navLink;
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
