/*
    This is the page that validates every single reservation before they are added to the reservation object
*/

const utilities = require("./utility.js");

// Validates every reservation request. If the request is invalid, returns a string describing the reason as to why the request failed.
// In case of a failure, whatever is returned is what RestoBot will say to the user.
function ValidateReservation(info, reservations, restaurants) {
    let clientNumber = info.originalRequest.data.From.slice(1); // This is where the clients phone number is stored when RestoBot is messaged, this will be used as the reservations unique ID if the reservation is valid
    let parameters = info.result.parameters; // This is where all the information needed to make a reservation is being kept
    if (JSON.stringify(parameters) === "{}") { return { validation: false } }
    // No reservations can be made if there are no restaurants to make reservations from
    if (JSON.stringify(restaurants) === "{}") { return { validation: false, answer: "I'm sorry, it would seem that my database does not contain any restaurants." } }
    if (parameters.name === "") { return { validation: false, answer: "Whoops, error", } }
    else if (parameters['given-name'] === "") { return { validation: false, answer: "Whoops, error", } }
    else if (parameters['number-integer'] === "") { return { validation: false, answer: "Whoops, error", } }
    else if (parameters['geo-city'] === "") { return { validation: false, answer: "Whoops, error", } }
    else if (parameters.date === "") { return { validation: false, answer: "Whoops, error", } }
    else if (parameters.time === "") { return { validation: false, answer: "Whoops, error", } }

    let restoName = parameters.name; // Needed to find if the desired restaurant exists in the restaurant object
    let restoCity = parameters['geo-city']; // Checks if restaurant exists in that area
    let date = parameters.date; // Needed for when we are going to find the number of available spots
    let time = parameters.time.slice(0, -3); // Needed to figure out when the reservation will take place, would usually display HH:MM:SS, now simply displays HH:MM
    let dateTime = date + "/" + time; // Needed to make sure a client does not make two reservations at the same time
    let hourIn = utilities.CheckTime(parameters.time); // See the CheckTime function
    let hourOut = hourIn + 1; // Lets us store the hour the reservation should end
    let nbSeats = utilities.CheckSeats(parseInt(parameters['number-integer'])); // See the CheckSeats function

    if ((new Date(dateTime) - new Date()) <= 0) { // Gets the amount of time until the reservation takes place in milliseconds
        return {
            validation: false,
            answer: "You cannot make reservations in the past, please make sure you enter a valid date."
        }
    }

    if (nbSeats === 0) { return { validation: false, answer: "You can't make a reservation for zero people!" } }
    else if (nbSeats === 10) {
        return {
            validation: false,
            answer: "I cannot make reservations for more than 8 people, if you wish to make reservations for big groups, " +
                "please contact the restaurant directly."
        }
    }

    if (reservations[clientNumber]) { // Verifies if an object with that ID (phone number) exists, or else what's inside would cause an error
        // Verifies the client isn't trying to making two reservations at the same time, on the same day
        // Clients cannot make reservations withing half an hour of one another since each reservation lasts one hour
        let avaiable = Object.keys(reservations[clientNumber]).filter(DateTime =>
            reservations[clientNumber][DateTime].date === date &&
            (hourIn <= reservations[clientNumber][DateTime].hourIn < hourOut ||
                hourIn < reservations[clientNumber][DateTime].hourOut <= hourOut));
        if (avaiable.length >= 1) {
            return {
                validation: false,
                answer: "I cannot make this reservations because it would conflict with another one of your reservations."
            }
        }
    }

    let restoFound = Object.keys(restaurants).filter(restoID => // Verifies if there is the desired Restaurant at the requested city
        restaurants[restoID].Name.toLowerCase() === restoName.toLowerCase() && // .toLowerCase is to prevent any possible errors
        restaurants[restoID].City.toLowerCase() === restoCity.toLowerCase() && // .toLowerCase is to prevent any possible errors
        utilities.CheckTime(restaurants[restoID].OpenHours) > hourIn && // Checks if the resto is open when the reservation starts
        utilities.CheckTime(restaurants[restoID].CloseHours) < hourOut); // Checks if the resto is closed when the reservation ends
    if (restoFound.length < 1) {
        return {
            validation: false,
            answer: "Our database does not containt a " + restoName + " in " + restoCity + " that is open at the desired time. Maybe they don't take reservations?"
        }
    }

    let conflictingReservations = Object.keys(reservations).filter(ID => // Finds every reservation at the same place and time and keeps the total
        Object.keys(reservations[ID]).filter(DateTime =>
            reservations[ID][DateTime].name === restoName && // Finds reservations at the same restaurant
            reservations[ID][DateTime].city === restoCity && // Finds reservations at the same city
            reservations[ID][DateTime].nbSeats === nbSeats && // Finds reservations that require the same amount of seats
            reservations[ID][DateTime].date === date && // Finds every reservation on the same day as the clients
            (hourIn <= reservations[ID][DateTime].hourIn < hourOut || // Finds every reservation that would begin during the clients reservation
                hourIn < reservations[ID][DateTime].hourOut <= hourOut))); // Finds every reservation that would end during the clients reservation

    let seatsNeeded; // Variable must be declared here
    switch (nbSeats) { // Allows us to determine which 'Nb#Seaters' we need to use when looking for any available reservations
        case 2: seatsNeeded = 'Nb2Seaters'; break; // If nbSeats is 2, we need to look in the Nb2Seaters property
        case 4: seatsNeeded = 'Nb4Seaters'; break; // If nbSeats is 4, we need to look in the Nb4Seaters property
        case 6: seatsNeeded = 'Nb6Seaters'; break; // If nbSeats is 6, we need to look in the Nb6Seaters property
        case 8: seatsNeeded = 'Nb8Seaters'; break; // If nbSeats is 8, we need to look in the Nb8Seaters property
        default: return { validation: false, answer: "You shouldn't be seeing this message..." } // nbSeats should only have a value of 2, 4, 6 or 8 due to earlier functions
    }

    let restoAvailable = restoFound.filter(restoID => restaurants[restoID][seatsNeeded] > conflictingReservations.length); // Finds if there are any seats left at the time the clients reservation would take place
    if (restoAvailable.length === 0) { return { validation: false, answer: "There are no seats available at the desired time." } } // If no seats are avaiable, returns to the client
    else {
        let choice = {};
        restoAvailable.map((x, i) => choice[i] = {
            name: restaurants[x].Name,
            city: restaurants[x].City,
            address: restaurants[x].Address,
            phone: restaurants[x].Phone,
            nbPeople: parseInt(parameters['number-integer']),
            nbSeats
        });
        let question = "";
        let request = "";
        let convoLenght = 0;
        let options = utilities.Confirmation(choice, restoAvailable.length, true);
        // If there are multiple restaurants that meet the criteria of the client, displays a list to the client and the client is then invited to pick where they wish to go
        if (restoAvailable.length >= 2) {
            question = "There are more than one restaurants which meet the criteria, please enter the number of the one you wish to make a reservation at.";
            request = "reservationoption";
            convoLenght = 2;
        }
        // If there is only one, creates the reservation
        else {
            question = "There is one restaurant that met your specifications, make a reservation?";
            request = "reservationconfirmation";
            convoLenght = 1;
        }
        return {
            validation: true,
            answer: question + options,
            contextOut: [{
                "name": request,
                parameters: { choice },
                "lifespan": convoLenght
            }]
        }
    }
}

module.exports = {
    ValidateReservation
}