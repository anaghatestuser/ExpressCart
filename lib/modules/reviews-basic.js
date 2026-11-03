const ObjectId = require('mongodb').ObjectID;
const crypto = require('crypto');
const badwordsList = require('badwords-list');

// A review is uniquely identified by its (product, customer) pair. Deriving
// the review _id from the pair lets the always-unique _id index atomically
// reject duplicate reviews, even when duplicate submissions race.
const getReviewId = (productId, customerId) => {
    const hash = crypto.createHash('sha256')
        .update(`${productId.toHexString()}:${customerId.toHexString()}`)
        .digest('hex');
    return ObjectId(hash.substring(0, 24));
};

const createReview = async (req) => {
    const db = req.app.db;

    // The product and customer IDs must be supplied and valid.
    // Note: ObjectId(undefined) generates a random ID rather than
    // throwing, so the values are checked for presence first.
    if(!req.body.product || !req.session.customerId){
        return {
            error: 'Invalid product'
        };
    }
    let productId;
    let customerId;
    try{
        productId = ObjectId(req.body.product);
        customerId = ObjectId(req.session.customerId);
    }catch(ex){
        return {
            error: 'Invalid product'
        };
    }

    // Check the product exists so reviews cannot be attached to
    // arbitrary, nonexistent product IDs
    const product = await db.products.findOne({ _id: productId });
    if(!product){
        return {
            error: 'Invalid product'
        };
    }

    // Check if user has made an existing review
    const existingReview = await db.reviews.countDocuments({
        product: productId,
        customer: customerId
    });
    if(existingReview){
        return {
            error: 'Review already submitted'
        };
    }

    // Check for bad words in review
    const badWordTitle = badwordsList.array.some(r => req.body.title.split(' ').indexOf(r) >= 0);
    const badWordDescription = badwordsList.array.some(r => req.body.description.split(' ').indexOf(r) >= 0);
    if(badWordTitle || badWordDescription){
        return {
            error: 'Review was declined. Please check inputs'
        };
    }

    // Create new review
    const review = {
        _id: getReviewId(productId, customerId),
        product: productId,
        title: req.body.title,
        description: req.body.description,
        rating: req.body.rating,
        customer: customerId,
        date: new Date()
    };

    try{
        const newReview = await db.reviews.insertOne(review);
        return newReview;
    }catch(ex){
        // A duplicate key means a racing request already inserted a
        // review for this product/customer pair
        if(ex && (ex.code === 11000 || ex.code === 11001)){
            return {
                error: 'Review already submitted'
            };
        }
        console.log('Create review', ex);
        return {
            error: 'Unable to create review'
        };
    }
};

const getRatingHtml = (rating) => {
    let ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
    switch(rating){
        case 1:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
            break;
        case 2:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
            break;
        case 3:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
            break;
        case 4:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i></div>';
            break;
        case 5:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i></div>';
            break;
        default:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
    }
    return ratingHtml;
};

module.exports = {
    createReview,
    getRatingHtml
};
