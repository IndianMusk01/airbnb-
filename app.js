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
const passport = require('passport');
const LocalStrategy = require('passport-local');
const User = require('./models/user.js');
const { isLoggedIn, saveRedirectUrl } = require('./middleware.js');

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

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req,res,next)=>{
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currentUser = req.user;
    next();
});
//creating demo user
app.get("/demouser", async (req, res) => { 
    let fakeUser = new User({
        email: "princekp@gmail.com",
        username: "princekp"
    });
    let registeredUser = await User.register(fakeUser, "password");
    res.send(registeredUser);
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
app.get("/listings/new", isLoggedIn,(req, res) => {
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
app.get("/listings/:id/edit", isLoggedIn,wrapAsync(async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        throw new ExpressError("Listing not found", 404);
    }
    res.render("listings/edit.ejs", { listing });
}));

// Update Listing
app.put("/listings/:id",isLoggedIn, validate(listingSchema), wrapAsync(async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndUpdate(id, req.body.listing);
    req.flash('success', 'Successfully updated a listing!');
    res.redirect(`/listings/${id}`);
}));

// Delete Listing
app.delete("/listings/:id",isLoggedIn, wrapAsync(async (req, res) => {
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
    const listing = await Listing.findById(id).populate('reviews').populate('owner');
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
//signup route
app.get("/signup",(req,res)=>{
    res.render("users/signup.ejs");
});
app.post("/signup",wrapAsync(async(req,res)=>{
    const {email,username,password} = req.body;
    const user = new User({email,username});
    const registeredUser = await User.register(user,password);
    req.login(registeredUser,err=>{
        if(err) return next(err);
        req.flash('success', 'Welcome to Wanderlust!');
        res.redirect('/listings');
    });
}));
//login route
app.get("/login",(req,res)=>{
    res.render("users/login.ejs");
});
app.post("/login", saveRedirectUrl ,passport.authenticate('local',{failureFlash:true,failureRedirect:'/login'}),async(req,res)=>{
    req.flash('success', 'Welcome back!');
    res.redirect(res.locals.redirectUrl || '/listings');
});
//logout route
app.get("/logout",(req,res,next)=>{
    req.logout((err)=>{
        if(err) {return next(err);
        }
        req.flash('success', 'Goodbye!');
        res.redirect('/listings');
    });
});



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
