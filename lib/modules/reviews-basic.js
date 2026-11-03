const ObjectId = require('mongodb').ObjectID;
const badwordsList = require('badwords-list');

// Escape string for use in a RegExp
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pre-compile a boundary-aware, case-insensitive matcher per bad word so that
// case changes, attached punctuation and non-space separators cannot evade it
const badWordRegexes = badwordsList.array.map((word) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`, 'i'));

const containsBadWord = (text) => badWordRegexes.some((regex) => regex.test(text));

const createReview = async (req) => {
    const db = req.app.db;

    // Validate the product ID before use
    if(!ObjectId.isValid(req.body.product)){
        return {
            error: 'Please supply a valid product'
        };
    }

    try{
        // Check if user has made an existing review
        const existingReview = await db.reviews.countDocuments({
            product: ObjectId(req.body.product),
            customer: ObjectId(req.session.customerId)
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
            product: ObjectId(req.body.product),
            title: req.body.title,
            description: req.body.description,
            rating: req.body.rating,
            customer: ObjectId(req.session.customerId),
            date: new Date()
        };

        const newReview = await db.reviews.insertOne(review);
        return newReview;
    }catch(ex){
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
