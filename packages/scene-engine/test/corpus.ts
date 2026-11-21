/**
 * Evaluation corpus: 500 English chat messages with the scene a person would expect.
 * Written as people actually text (not to fit the rules), so some are expected to fail —
 * the eval report shows which, to guide rule improvements.
 *
 * - `expect: null` means "no confident suggestion" (tier must be 'none').
 * - `kind: 'sarcasm'` cases also require that the engine does NOT auto-suggest.
 */

export interface CorpusCase {
  text: string;
  expect: string | null;
  kind?: 'negation' | 'sarcasm';
}

const byScene: Record<string, string[]> = {
  // ----- Emotions -----
  happy_dance: [
    "I'm so happy right now!!",
    'Best day ever, everything went right',
    'Feeling good today :)',
    'Yay!! That is amazing news',
  ],
  sad_rain: [
    "I'm feeling really down today",
    'Had such a bad day honestly',
    'so sad rn 😭',
    'I feel lonely tonight',
  ],
  angry_steam: [
    "I'm so mad at him right now",
    'This is so annoying',
    "Ugh I'm furious",
    "I'm fed up with this group project",
  ],
  laughing_tears: [
    'LMAO that is hilarious',
    'hahaha I cannot stop laughing',
    '😂😂😂',
    "lol you're so funny",
  ],
  surprised_gasp: [
    'OMG no way!!',
    'Wait what?? Really?',
    "I can't believe it",
    'Wow I did not see that coming',
  ],
  tired_yawn: [
    "I'm so tired",
    'Completely exhausted after today',
    'I need sleep so bad',
    'feeling drained and sleepy',
  ],
  nervous_sweat: [
    "I'm so nervous about tomorrow",
    'kinda anxious ngl',
    'freaking out a little',
    "I'm really worried about it",
  ],
  excited_jump: [
    "I'm so excited!!",
    "Can't wait for Saturday!",
    "I'm so hyped for this",
    'Really looking forward to it',
  ],
  bored_sigh: [
    "I'm so bored",
    'This class is so boring',
    'Nothing to do today, meh',
    'bored out of my mind',
  ],
  confused_question: [
    "I'm confused, what do you mean?",
    "Huh? I don't understand",
    'That makes no sense to me',
    "I have no idea what's going on",
  ],

  // ----- Greetings -----
  wave_hello: ['Hey!', 'Hi there 👋', 'Hello hello', 'yo whats up'],
  good_morning_sun: ['Good morning!', 'Morning sunshine', 'gm everyone', 'Rise and shine!'],
  good_night_moon: [
    'Good night!',
    'gn, sleep well',
    'Night night 😴',
    "I'm off to bed, sweet dreams",
  ],
  goodbye_wave: ['Bye!', 'See you later!', 'ttyl', 'Take care, see ya'],
  welcome_back: [
    'Welcome back!!',
    'Welcome home, we missed you',
    "You're back!",
    'Glad you are back',
  ],
  long_time_no_see: [
    'Long time no see!',
    "It's been ages!",
    'Where have you been??',
    "It's been forever",
  ],
  hug_hello: ['Sending you a big hug', 'Hugs!!', 'Bear hug when I see you', 'Come here, group hug'],
  how_are_you: ['How are you?', "How's it going?", 'How have you been?', 'How was your day?'],

  // ----- Food and Drink -----
  dinner_out: [
    'Can we go out for dinner tonight?',
    'Wanna grab dinner later?',
    'Dinner at that new restaurant on Friday?',
    "Let's eat out tonight",
  ],
  lunch_together: [
    'Lunch?',
    'Want to grab lunch tomorrow?',
    "Let's do lunch at noon",
    'Lunch break together?',
  ],
  tea_time: ['Fancy a cup of tea?', 'Tea time!', 'Want some chai?', 'Making matcha, want some?'],
  coffee_break: [
    'Coffee?',
    "Let's grab a coffee",
    'Need caffeine asap',
    'Meet me at the cafe for a latte',
  ],
  boba_run: [
    'Boba run?',
    'I need bubble tea right now',
    'Want to get milk tea after school?',
    'Taro boba hits different',
  ],
  pizza_party: [
    'Pizza tonight?',
    "Let's order pizza",
    'Pepperoni or margherita?',
    'Pizza night at my place!',
  ],
  ramen_slurp: ['Ramen?', 'Craving ramen so bad', "Let's get noodles", 'Pho for dinner?'],
  breakfast_brunch: [
    'Brunch on Sunday?',
    'Pancakes for breakfast!',
    'Want to get breakfast tomorrow?',
    'Making waffles',
  ],
  cooking_at_home: [
    "I'm cooking tonight",
    'Baking cookies today',
    'Trying a new recipe',
    "I'll cook for you",
  ],
  dessert_treat: ['Ice cream?', 'I need dessert', 'Want some chocolate cake?', 'Donuts on me'],
  so_hungry: ["I'm starving", 'So hungry rn', 'I need food now', 'Got any snacks?'],

  // ----- Travel -----
  road_trip: [
    'Road trip this weekend?',
    "Let's go on a long drive",
    "We're driving to the coast!",
    'Car ride with the squad',
  ],
  flight_takeoff: [
    'Just landed!',
    'Boarding my flight now',
    'On the plane, see you soon',
    'My flight leaves at 6',
  ],
  airport_waiting: [
    'Stuck at the airport',
    'My flight got delayed',
    'Long layover in Dubai',
    'Waiting at the gate',
  ],
  train_ride: [
    "I'm on the train",
    'Taking the subway home',
    'Train leaves at 9',
    'At the train station now',
  ],
  beach_day: [
    'Beach day!',
    "Let's go to the beach tomorrow",
    'Swimming in the ocean',
    'Waves are perfect today',
  ],
  hotel_checkin: [
    'Just checked in to the hotel',
    'Our Airbnb is so cute',
    'Room service time',
    'The resort is amazing',
  ],
  stuck_in_traffic: [
    "I'm stuck in traffic",
    'Traffic is terrible',
    'Rush hour is the worst',
    'Traffic jam on the highway',
  ],
  hiking_trail: [
    'Hike on Saturday?',
    'Going hiking in the mountains',
    'Made it to the summit!',
    'Trail run tomorrow morning',
  ],
  camping_night: [
    'Camping this weekend!',
    "Let's go camping",
    "S'mores by the campfire",
    'Sleeping in a tent tonight',
  ],
  vacation_packing: [
    'Packing for my trip',
    'Vacation starts tomorrow!',
    'Need a getaway',
    'Going travelling next month',
  ],

  // ----- Movies and Fun -----
  movie_night: [
    'Movie tonight?',
    'Want to watch a movie?',
    'Cinema on Friday?',
    'Popcorn and a film',
  ],
  binge_watch: [
    'Binge watching Netflix all day',
    'Did you see the new episode?',
    'This anime is so good',
    'Just finished the series',
  ],
  gaming_session: ['Wanna play games?', 'Minecraft later?', 'Ranked tonight?', 'Hop on Fortnite'],
  concert_crowd: [
    'Concert tonight!!',
    'Got tickets for the festival',
    'Live music at the park',
    'Their tour is coming here',
  ],
  karaoke: ['Karaoke night?', "Let's go sing", 'Noraebang after dinner?', 'Duet with me'],
  bowling: [
    'Bowling on Friday?',
    'Arcade after school?',
    'Escape room this weekend?',
    'Laser tag anyone?',
  ],
  theme_park: [
    'Theme park trip!',
    'Roller coasters all day',
    'Disneyland next month!',
    'Going to the fair',
  ],
  board_games: ['Board game night?', 'Uno at my place', "Let's play chess", 'Monopoly anyone?'],
  dance_party: [
    'Wanna go dancing?',
    'Club tonight?',
    'Dance floor is calling',
    "Let's go to the disco",
  ],

  // ----- Date and Romance (adult users) -----
  romantic_dinner: [
    'Romantic dinner tonight?',
    'Booked a candlelit dinner for us',
    'Dinner date on Friday?',
    'Anniversary dinner at our spot',
  ],
  date_night: [
    'Date night?',
    'Will you go on a date with me?',
    'Our date tomorrow!',
    'Be my date for the dance?',
  ],
  heart_eyes: [
    'You look gorgeous',
    'Omg my crush texted me',
    "You're so cute",
    'You look amazing tonight',
  ],
  first_date_nerves: [
    'First date tomorrow, help',
    'What should I wear for the date?',
    'So nervous about the first date',
    'Going on a blind date',
  ],
  flowers_gift: [
    'Got you flowers 💐',
    'Roses for you',
    "Happy Valentine's",
    'A bouquet just for you',
  ],
  slow_dance: [
    'Dance with me?',
    'They are playing our song',
    'Slow dance later?',
    "Let's dance together",
  ],
  miss_you_love: ['I love you', 'Miss you babe', 'Love you so much my love', 'xoxo sweetheart'],
  cuddle_couch: [
    'Wanna cuddle?',
    'Snuggle on the couch tonight?',
    'Netflix and chill?',
    'Cuddling on the couch with you',
  ],

  // ----- Friends -----
  hangout_friends: [
    'Wanna hang out?',
    'Are you free tonight?',
    'Come over later',
    "Let's meet up this weekend",
  ],
  high_five: ['Nailed it!', 'High five!', 'Great job team', 'We did it!!'],
  group_selfie: ['Selfie time!', 'Take a pic of us', 'Group photo!', 'Send me the photos'],
  sleepover: [
    'Sleepover at mine?',
    'Slumber party this Friday!',
    'Can I stay over?',
    'Crash at my place tonight',
  ],
  best_friends: [
    'Love you bestie',
    "You're my best friend",
    'BFFs forever',
    'Best friends since day one',
  ],
  gossip_chat: [
    'Spill the tea',
    'Guess what happened',
    'Did you hear about Sam?',
    "You won't believe this drama",
  ],
  video_call: ['Call me?', 'FaceTime later?', 'Can I call you?', 'Video call tonight?'],
  miss_you_friend: [
    'Miss you!',
    'Miss you guys so much',
    'Wish you were here',
    'Missed hanging out with you',
  ],
  on_my_way: ['On my way!', 'omw', 'Be there soon', "Leaving now, I'm coming"],

  // ----- Family -----
  family_dinner: [
    'Family dinner tonight',
    'Sunday dinner at my parents',
    'Having dinner with my family',
    'Dinner at home with everyone',
  ],
  call_mom: [
    'My mom says hi',
    'Calling my mom later',
    'Dad is picking me up',
    'My parents are visiting',
  ],
  visit_grandparents: [
    'Visiting my grandma this weekend',
    'Grandpa made cookies',
    'At my grandparents house',
    'Nana says hello',
  ],
  family_photo: [
    'Family reunion today',
    'Taking the family photo',
    'All my cousins are here',
    'Big family gathering tonight',
  ],
  sibling_fight: [
    'My little brother is so annoying',
    'Fighting with my sister again',
    'Siblings, am I right',
    'My brother ate my snacks',
  ],
  pet_cuddle: ['My dog is so cute', 'Look at my cat', 'We got a puppy!!', 'Cuddling my kitten'],
  parents_proud: [
    'So proud of you',
    'My parents are proud of me',
    'Made my parents proud today',
    'Proud of you kiddo',
  ],
  new_baby: [
    "It's a baby girl!",
    'My sister is pregnant',
    'Baby shower on Sunday',
    'Meet my new nephew',
  ],

  // ----- Celebration -----
  birthday_cake: ['Happy birthday!!', 'HBD 🎂', 'Birthday party on Saturday', "It's my birthday!"],
  congrats_confetti: [
    'Congrats!!',
    'Congratulations, well deserved',
    'So happy for you!',
    'Kudos on the win',
  ],
  party_time: [
    'Party at my place!',
    "Let's celebrate tonight",
    'House party Saturday',
    'Throwing a party, come',
  ],
  new_year_fireworks: [
    'Happy New Year!',
    'NYE plans?',
    'Countdown time!',
    'Watching the fireworks',
  ],
  graduation_cap: ['I graduated!!', 'Graduation is tomorrow', 'Got my diploma', 'Class of 2026!'],
  cheers_toast: ['Cheers!', "Let's raise a glass", 'A toast to us', 'Cheers to the weekend'],
  got_the_job: [
    'I got the job!!',
    'Just got promoted',
    'I passed my driving test',
    'Got accepted into college!',
  ],
  wedding_bells: [
    "We're getting married!",
    'Wedding invite is in the mail',
    'They got engaged',
    'Wedding this weekend',
  ],

  // ----- Work and Study -----
  study_session: [
    'Study session at the library?',
    'Doing homework all night',
    'Study group tomorrow?',
    'Revising for history',
  ],
  exam_stress: [
    'Exam tomorrow 😬',
    'Finals week is killing me',
    'Got a math test today',
    'Midterms are coming',
  ],
  deadline_panic: [
    'Deadline is tomorrow',
    'Essay due tonight help',
    'So much work to finish',
    'Behind on everything',
  ],
  meeting: [
    'In a meeting',
    'Back to back meetings today',
    'Presentation with the client at 3',
    'Boss wants a meeting',
  ],
  working_late: [
    'Working late tonight',
    'Still at work',
    'Pulling an all nighter',
    'Overtime again',
  ],
  school_day: [
    'First day of school!',
    'Class starts at 8',
    'Heading to campus',
    'Lecture was long today',
  ],
  day_off: ['Day off today!', 'TGIF', 'Long weekend!!', 'No school tomorrow'],
  monday_blues: [
    'Monday again',
    'Back to work tomorrow',
    'Mondays are the worst',
    'Another week begins',
  ],

  // ----- Daily Life -----
  gym_workout: ['Gym later?', 'Leg day today', 'Going for a run', 'Yoga class at 7'],
  groceries: [
    'At the grocery store, need anything?',
    'Grocery shopping',
    'Picking up milk and bread',
    'Costco run',
  ],
  shopping_mall: [
    'Shopping at the mall?',
    'Bought new shoes',
    'Huge sale today!',
    'Need a new outfit',
  ],
  cleaning_room: ['Cleaning my room', 'Doing laundry', 'So many chores today', 'Dishes again'],
  walking_dog: ['Going for a walk', 'Walking the dog', 'Want to take a walk?', 'Evening stroll'],
  sleeping_in: ['Sleeping in today', 'Taking a nap', 'I overslept', 'Lazy day in bed'],
  running_late: [
    "I'm running late",
    'Sorry, be there in 10',
    'Missed the bus, running late',
    "I'll be a few minutes late",
  ],
  commute_bus: ['On the bus', 'Long commute today', 'Taking an Uber', 'Waiting at the bus stop'],
  at_home_chill: [
    'Staying home tonight',
    'Just relaxing at home',
    'Cozy night in',
    'Doing nothing today',
  ],

  // ----- Support -----
  comfort_hug: [
    "I'm here for you",
    'That sucks, sending love',
    "You're not alone",
    'Hang in there',
  ],
  get_well_soon: [
    'Get well soon!',
    'Feel better soon',
    "I'm sick with the flu",
    'Not feeling well today',
  ],
  you_got_this: ['You got this!', 'Good luck today!', 'Break a leg!', 'I believe in you'],
  sorry_apology: ["I'm so sorry", 'My bad', 'Please forgive me', 'I messed up, sorry'],
  thank_you_bow: [
    'Thank you so much!',
    'Thanks!!',
    'Really appreciate it',
    "You're the best, thanks",
  ],
  cancel_plans: [
    "Can't make it tonight",
    'Rain check?',
    'I have to cancel',
    'Something came up, sorry',
  ],
  need_to_talk: [
    'Can we talk?',
    'I need advice',
    'Having a hard time lately',
    'Are you there? need to vent',
  ],
  calm_breathe: ['No worries!', 'Take a deep breath', "Don't worry about it", "It's fine, relax"],

  // ----- Seasonal -----
  christmas_tree: [
    'Merry Christmas!',
    'Decorating the Christmas tree',
    'Xmas eve plans?',
    'Santa came!',
  ],
  halloween_pumpkin: [
    'Happy Halloween!',
    'Trick or treat tonight?',
    'What is your costume?',
    'Carving pumpkins',
  ],
  summer_sun: ["It's so hot today", 'Summer break!!', 'Pool day?', 'Heatwave again'],
  snow_day: ["It's snowing!", 'Snow day!!', 'Building a snowman', 'Freezing cold out'],
  spring_blossom: [
    'Cherry blossoms are out',
    'Picnic in the park?',
    'Spring is here',
    'Hanami this weekend?',
  ],
  autumn_leaves: ['Fall vibes', 'Pumpkin spice season', 'Sweater weather', 'Happy Thanksgiving!'],
  rainy_day: ["It's pouring outside", 'Raining all day', 'Forgot my umbrella', 'Big storm tonight'],
  festival_lights: [
    'Happy Diwali!',
    'Happy Lunar New Year',
    'Eid Mubarak!',
    'Lighting the lanterns tonight',
  ],
};

/** Messages that shouldn't get a confident scene. */
const noScene: string[] = ['The invoice number is 4471-B', 'k'];

/** 50 cases where negation or sarcasm changes the meaning. */
const tricky: CorpusCase[] = [
  // --- negation (30) ---
  { text: 'Not coming tonight', expect: 'cancel_plans', kind: 'negation' },
  { text: 'Coming tonight', expect: 'on_my_way', kind: 'negation' },
  { text: "I can't make it to dinner", expect: 'cancel_plans', kind: 'negation' },
  { text: "I won't be at the party", expect: 'cancel_plans', kind: 'negation' },
  { text: "Sorry, I'm not going to the movie", expect: 'cancel_plans', kind: 'negation' },
  { text: "I'm not happy about this", expect: 'sad_rain', kind: 'negation' },
  { text: "I'm not feeling great today", expect: 'sad_rain', kind: 'negation' },
  { text: "I'm not mad at you", expect: 'calm_breathe', kind: 'negation' },
  { text: "I'm not upset, it's okay", expect: 'calm_breathe', kind: 'negation' },
  { text: "Don't worry about the money", expect: 'calm_breathe', kind: 'negation' },
  { text: "Can't come to lunch tomorrow", expect: 'cancel_plans', kind: 'negation' },
  { text: "We're not doing pizza tonight", expect: 'cancel_plans', kind: 'negation' },
  { text: 'No gym for me today', expect: 'cancel_plans', kind: 'negation' },
  { text: "I can't wait for dinner tonight!", expect: 'dinner_out', kind: 'negation' },
  { text: 'No worries, see you tomorrow', expect: 'calm_breathe', kind: 'negation' },
  { text: "I'm not tired at all", expect: null, kind: 'negation' },
  { text: "I'm not hungry", expect: null, kind: 'negation' },
  { text: 'Never been so happy', expect: 'happy_dance', kind: 'negation' },
  { text: "I'm not sure I can come", expect: 'cancel_plans', kind: 'negation' },
  { text: "Won't make it to the game, sorry", expect: 'cancel_plans', kind: 'negation' },
  { text: 'Not feeling well, staying home', expect: 'get_well_soon', kind: 'negation' },
  { text: 'Not bad at all!', expect: 'happy_dance', kind: 'negation' },
  { text: "I'm not bored anymore", expect: 'calm_breathe', kind: 'negation' },
  { text: "We aren't going to the beach after all", expect: 'cancel_plans', kind: 'negation' },
  { text: "I can't come over tonight", expect: 'cancel_plans', kind: 'negation' },
  { text: "Can't join the call, sorry", expect: 'cancel_plans', kind: 'negation' },
  {
    text: "Let's not go out tonight, stay home instead",
    expect: 'at_home_chill',
    kind: 'negation',
  },
  { text: "I'm not sad, just tired", expect: 'tired_yawn', kind: 'negation' },
  { text: 'Not coming to school tomorrow', expect: 'cancel_plans', kind: 'negation' },
  { text: "I don't hate it, it's actually fun", expect: 'happy_dance', kind: 'negation' },
  // --- sarcasm (20): engine must not auto-suggest ---
  { text: 'Oh great, stuck in traffic again 🙄', expect: 'stuck_in_traffic', kind: 'sarcasm' },
  { text: 'Yeah right, like that will ever happen', expect: null, kind: 'sarcasm' },
  { text: 'Wow thanks a lot for ditching me', expect: null, kind: 'sarcasm' },
  { text: 'Love that for me, another Monday meeting', expect: 'monday_blues', kind: 'sarcasm' },
  { text: "Can't wait for the dentist tomorrow, so much fun", expect: null, kind: 'sarcasm' },
  { text: 'Best day ever, my flight got cancelled', expect: 'airport_waiting', kind: 'sarcasm' },
  { text: 'Just perfect, it started raining on our picnic', expect: 'rainy_day', kind: 'sarcasm' },
  { text: 'Oh joy, more homework', expect: 'study_session', kind: 'sarcasm' },
  { text: 'Living the dream, working overtime again', expect: 'working_late', kind: 'sarcasm' },
  { text: 'Fantastic, the power is out', expect: null, kind: 'sarcasm' },
  { text: 'I just love doing laundry at midnight', expect: 'cleaning_room', kind: 'sarcasm' },
  { text: 'Thanks for nothing', expect: null, kind: 'sarcasm' },
  { text: 'So excited for my 6am exam 🙃', expect: 'exam_stress', kind: 'sarcasm' },
  { text: 'Great, another deadline', expect: 'deadline_panic', kind: 'sarcasm' },
  { text: 'Wow what a fun three hour delay', expect: 'airport_waiting', kind: 'sarcasm' },
  { text: 'Exactly what I needed, a flat tire', expect: null, kind: 'sarcasm' },
  { text: 'Cool cool cool, nobody showed up to my party', expect: 'party_time', kind: 'sarcasm' },
  { text: 'Said no one ever: I love Mondays', expect: 'monday_blues', kind: 'sarcasm' },
  { text: 'Totally thrilled to be sick on my birthday', expect: 'birthday_cake', kind: 'sarcasm' },
  { text: 'Oh wonderful, the bus is late again 😒', expect: 'commute_bus', kind: 'sarcasm' },
];

export const corpus: CorpusCase[] = [
  ...Object.entries(byScene).flatMap(([scene, texts]) =>
    texts.map((text) => ({ text, expect: scene })),
  ),
  ...noScene.map((text) => ({ text, expect: null })),
  ...tricky,
];
