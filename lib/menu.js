const _ = require('lodash');

const getMenu = (db) => {
    return db.menu.findOne({});
};

// Restricts a menu link to safe URL forms. Browsers strip leading C0 control
// characters/whitespace and remove tab/CR/LF anywhere in a URL before
// resolving its scheme, so the check below does the same before looking for
// a scheme. Only relative links and absolute links with an http, https,
// mailto or tel scheme are kept; anything else (javascript:, data:,
// vbscript:, ...) is neutralized to '#' so it can never become an
// executable href when rendered.
const sanitizeLink = (link) => {
    if(typeof link !== 'string' || link.trim() === ''){
        return '#';
    }
    let normalized = link;
    while(normalized.length > 0 && normalized.charCodeAt(0) <= 0x20){
        normalized = normalized.substring(1);
    }
    normalized = normalized
        .replace(/[\t\n\r]/g, '')
        .toLowerCase();
    const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/);
    if(scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme[1])){
        return '#';
    }
    return link;
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
        // Never hand an executable link to the views, even if a
        // malicious value was stored before it could be validated
        menu.items.forEach((item) => {
            if(item){
                item.link = sanitizeLink(item.link);
            }
        });
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
