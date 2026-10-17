const _ = require('lodash');

// Schemes permitted for menu links. Anything else (eg. javascript:,
// data:, vbscript:) is neutralized so it cannot execute when the link
// is rendered into an href attribute.
const allowedLinkSchemes = ['http', 'https', 'mailto', 'tel'];

const cleanLink = (link) => {
    if(typeof link !== 'string'){
        return '#';
    }
    const trimmed = link.trim();
    if(trimmed === ''){
        return '#';
    }
    // Browsers ignore whitespace/control characters inside a URL scheme,
    // so strip them before checking to catch obfuscated values
    // (eg. "java\tscript:alert(1)")
    const schemeMatch = trimmed.replace(/\s/g, '').match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if(schemeMatch && !allowedLinkSchemes.includes(schemeMatch[1].toLowerCase())){
        return '#';
    }
    return trimmed;
};

const getMenu = (db) => {
    return db.menu.findOne({});
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
            link: cleanLink(req.body.navLink),
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
        menu.items[menuIndex].link = cleanLink(req.body.navLink);
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
