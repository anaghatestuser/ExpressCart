const {
    getConfig
} = require('./config');

/**
 * @param  {boolean} frontend // whether or not this is an front or admin call
 * @param  {req} req // express `req` object
 * @param  {integer} page // The page number
 * @param  {string} collection // The collection to search
 * @param  {object} query // The mongo query
 * @param  {object} sort // The mongo sort
 */
const paginateData = async (frontend, req, page, collection, query, sort) => {
    const db = req.app.db;
    const config = getConfig();
    let numberItems = 10;
    if(frontend){
        numberItems = config.productsPerPage ? config.productsPerPage : 6;
    }

    if(!query){
        query = {};
    }
    if(!sort){
        sort = {};
    }

    try{
        // Count the total items so the requested page can be validated
        const totalItems = await db[collection].countDocuments(query);

        // Sanitize the page number. It must be a positive integer within the
        // range of pages which exist. This bounds the `skip` value sent to
        // the database to the size of the result set.
        page = parseInt(page);
        if(isNaN(page) || page < 1){
            page = 1;
        }
        const lastPage = Math.max(Math.ceil(totalItems / numberItems), 1);
        if(page > lastPage){
            // Page is out of range. No data exists beyond the last page.
            return { data: [], totalItems };
        }

        const skip = (page - 1) * numberItems;

        // Run our query
        const data = await db[collection].find(query).skip(skip).limit(parseInt(numberItems)).sort(sort).toArray();
        return { data, totalItems };
    }catch(err){
        throw new Error('Error retrieving paginated data');
    }
};

/**
 * @param  {boolean} frontend // whether or not this is an front or admin call
 * @param  {req} req // express `req` object
 * @param  {integer} page // The page number
 * @param  {string} collection // The collection to search
 * @param  {object} query // The mongo query
 * @param  {object} sort // The mongo sort
 */
const paginateProducts = async (frontend, db, page, query, sort) => {
    const config = getConfig();
    let numberItems = 10;
    if(frontend){
        numberItems = config.productsPerPage ? config.productsPerPage : 6;
    }

    if(!query){
        query = {};
    }
    if(!sort){
        sort = {};
    }

    try{
        // Count the total items so the requested page can be validated
        const totalItems = await db.products.countDocuments(query);

        // Sanitize the page number. It must be a positive integer within the
        // range of pages which exist. This bounds the `skip` value sent to
        // the database to the size of the result set.
        page = parseInt(page);
        if(isNaN(page) || page < 1){
            page = 1;
        }
        const lastPage = Math.max(Math.ceil(totalItems / numberItems), 1);
        if(page > lastPage){
            // Page is out of range. No data exists beyond the last page.
            return { data: [], totalItems };
        }

        const skip = (page - 1) * numberItems;

        // Run our query
        const data = await db.products.aggregate([
            { $match: query },
            {
                $lookup: {
                    from: 'variants',
                    localField: '_id',
                    foreignField: 'product',
                    as: 'variants'
                }
            }
        ]).sort(sort).skip(skip).limit(parseInt(numberItems)).toArray();
        return { data, totalItems };
    }catch(err){
        throw new Error('Error retrieving paginated data');
    }
};

const getSort = () => {
    const config = getConfig();
    let sortOrder = -1;
    if(config.productOrder === 'ascending'){
        sortOrder = 1;
    }
    let sortField = 'productAddedDate';
    if(config.productOrderBy === 'title'){
        sortField = 'productTitle';
    }

    return {
        [sortField]: sortOrder
    };
};

module.exports = {
    paginateData,
    paginateProducts,
    getSort
};
