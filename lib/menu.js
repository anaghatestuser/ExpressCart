const _ = require('lodash');

// Only safe URL schemes are allowed in menu links. Anything with a
// dangerous scheme (eg. javascript:, data:, vbscript:) or a non-string
// value is neutralised so it can never be stored or rendered as an
// active script URL.
const sanitizeLink = (link) => {
    if(typeof link !== 'string'){
        return '#';
    }
    const trimmed = link.trim();
    // Browsers strip ASCII whitespace/control chars when parsing URLs,
    // so remove them before checking the scheme (eg. "java\tscript:")
    const compact = trimmed.replace(/\s+/g, '');
    const schemeMatch = compact.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if(schemeMatch && ['http', 'https', 'mailto', 'tel'].indexOf(schemeMatch[1].toLowerCase()) === -1){
        return '#';
    }
    return trimmed;
};

const getMenu = (db) => {
    return db.menu.findOne({});
};

// Menu item links are rendered into the href attribute of the navigation on
// every public page, so only safe URL schemes may be stored.
const isSafeMenuLink = (link) => {
    if(typeof link !== 'string'){
        return false;
    }
    // Browsers strip tab/CR/LF anywhere in a URL and any leading control
    // chars or spaces when determining the scheme, so normalize the same
    // way before checking it.
    let normalized = link.replace(/[\t\r\n]/g, '');
    while(normalized.charCodeAt(0) <= 0x20){
        normalized = normalized.slice(1);
    }
    normalized = normalized.toLowerCase();
    const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/);
    if(scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme[1])){
        return false;
    }
    return true;
};

// A menu item requires a string title (templates call String methods on it)
// and a link restricted to safe URL schemes.
const isValidMenuItem = (title, link) => {
    if(typeof title !== 'string'){
        return false;
    }
    return isSafeMenuLink(link);
};

// creates a new menu item
const newMenu = (req) => {
    const db = req.app.db;
    if(!isValidMenuItem(req.body.navMenu, req.body.navLink)){
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
    if(!isValidMenuItem(req.body.navMenu, req.body.navLink)){
        return false;
    }
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
