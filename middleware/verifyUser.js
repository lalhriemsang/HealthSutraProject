const isVerified = (req, res, next) => {
  // Check if 'isVerified' is set in the session
  if (
    !req.session.user ||
    !req.session.user.phoneNumber ||
    !req.session.user.isVerified
  ) {
    return res
      .status(401)
      .json({
        message: "User not verfied! Please verfiy yourself through OTP",
      });
  }

  // If verified, proceed to the next middleware or route handler
  next();
};

export default isVerified;
