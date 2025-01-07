const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const Listing = require('./models/listing.js');
const Review = require('./models/review.js');
const wrapAsync = require('./utils/wrapAsync.js');
const ExpressError = require('./utils/ExpressError.js');
const { listingSchema, reviewSchema } = require('./schema.js');
const session = require('express-session');
const flash = require('connect-flash');


const app = express();
const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
app.use(express.static(path.join(__dirname, 'public')));

const sessionOptions = {
    secret: "mysupersecretcode",
    resave: false,
    saveUninitialized: true,
    cookie:{
        expires:Date.now() + 7*24*60*60*1000,
        maxAge:7*24*60*60*1000,
        HttpOnly:true,
    }
}

app.use(session(sessionOptions));
app.use(flash());

app.use((req,res,next)=>{
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});


// Connect to MongoDB
async function main() {
    await mongoose.connect(MONGO_URL);
}
main()
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.log('Error connecting to MongoDB', err));

// App settings
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', ejsMate);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Validation Middleware
const validate = schema => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        throw new ExpressError(error.details.map(el => el.message).join(','), 400);
    } else {
        next();
    }
};

// Routes
// New Listing Form
app.get("/listings/new", (req, res) => {
    res.render("listings/new.ejs");
});

// Create Listing
app.post("/listings", validate(listingSchema), wrapAsync(async (req, res) => {
    const newListing = new Listing(req.body.listing);
    await newListing.save();
    req.flash('success', 'Successfully made a new listing!');
    res.redirect('/listings');
}));

// Edit Listing Form
app.get("/listings/:id/edit", wrapAsync(async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        throw new ExpressError("Listing not found", 404);
    }
    res.render("listings/edit.ejs", { listing });
}));

// Update Listing
app.put("/listings/:id", validate(listingSchema), wrapAsync(async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndUpdate(id, req.body.listing);
    req.flash('success', 'Successfully updated a listing!');
    res.redirect(`/listings/${id}`);
}));

// Delete Listing
app.delete("/listings/:id", wrapAsync(async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash('success', 'Successfully deleted a listing!');
    res.redirect('/listings');
}));

// Create Review
app.post('/listings/:id/reviews', validate(reviewSchema), wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
        throw new ExpressError("Listing not found", 404);
    }
    const newReview = new Review(req.body.review);
    listing.reviews.push(newReview);
    await newReview.save();
    await listing.save();
    req.flash('success', 'Successfully made a new review!');
    res.redirect(`/listings/${listing._id}`);
}));

// Delete Review
app.delete('/listings/:id/reviews/:reviewId', wrapAsync(async (req, res) => {
    const { id, reviewId } = req.params;
    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash('success', 'Successfully deleted a review!');
    res.redirect(`/listings/${id}`);
}));

// Show Listing with Reviews
app.get('/listings/:id', wrapAsync(async (req, res) => {
    const id = req.params.id.trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ExpressError('Invalid ID format', 400);
    }
    const listing = await Listing.findById(id).populate('reviews');
    if(!listing){
        req.flash('error', 'Cannot find that listing!');
        res.redirect('/listings');
    }
    res.render('listings/show.ejs', { listing });
}));

// Index Route
app.get('/listings', wrapAsync(async (req, res) => {
    const allListings = await Listing.find({});
    res.render("listings/index.ejs", { allListings });
}));

// Root Route
app.get('/', (req, res) => {
    res.redirect('/listings');
});

// Error Handling
app.all('*', (req, res, next) => {
    next(new ExpressError('Page Not Found', 404));
});

app.use((err, req, res, next) => {
    const { statusCode = 500, message = "Something went wrong!" } = err;
    res.status(statusCode).render("error.ejs", { message });
});

// Start Server
app.listen(8080, () => {
    console.log('App listening on port 8080');
});
