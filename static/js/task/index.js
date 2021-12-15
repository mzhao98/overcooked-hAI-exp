import $ from "jquery"
import _ from "lodash"
import PageBlockSurveyHandler from "./js/pageblock-survey"
import PageBlockController from "./js/psiturk-pageblock-controller"
import Conditions from "./js/conditions"
import GameServerIO from "./js/gameserver-io"
import OvercookedSinglePlayerTask from "./js/overcooked-single";
import OvercookedSinglePlayerNoAdaptTask from "./js/overcooked-single-no-adapt";
import OvercookedSinglePlayerTrainingTask from "./js/overcooked-single-training"
import OvercookedSinglePlayerScaffoldOneTask from "./js/overcooked-single-scaffold-1"
import OvercookedSinglePlayerScaffoldTwoTask from "./js/overcooked-single-scaffold-2"

import OvercookedSinglePlayerTask_AdaptTwoStrategy from "./js/overcooked-single-adapt-2strat";
import OvercookedSinglePlayerTask_AdaptFourStrategy from "./js/overcooked-single-adapt-4strat";

import getOvercookedPolicy from "./js/load_tf_model.js";

import * as Overcooked from "overcooked"
let OvercookedMDP = Overcooked.OvercookedMDP;
let Direction = OvercookedMDP.Direction;
let Action = OvercookedMDP.Action;
let [NORTH, SOUTH, EAST, WEST] = Direction.CARDINAL;
let [STAY, INTERACT] = [Direction.STAY, Action.INTERACT];

var randomstring = require("randomstring");

//experimental variables
let EXP = {
    MAIN_TRIAL_TIME: 60, //seconds
    TIMESTEP_LENGTH: 150, //milliseconds
    DELIVERY_POINTS: 5,
    POINT_VALUE: .01,
    BASE_PAY: 1.00,
    PLAYER_INDEX: 1,  // Either 0 or 1
    MODEL_TYPE: 'ppo_bc'  // Either ppo_bc, ppo_sp, or pbt
};
let worker_bonus = 0;
let is_leader;
var train_time = 60;

/***********************************
      Main trial order
 ************************************/
function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

let layouts = {
    "cramped_room":[
        "XXPXX",
        "O  2O",
        "X1  X",
        "XDXSX"
    ],
    "asymmetric_advantages":[
        "XXXXXXXXX",
        "O XSXOX S",
        "X   P 1 X",
        "X2  P   X",
        "XXXDXDXXX"
    ],
    "coordination_ring":[
        "XXXPX",
        "X 1 P",
        "D2X X",
        "O   X",
        "XOSXX"
    ],
    "random3":[
        "XXXPPXXX",
        "X      X",
        "D XXXX S",
        "X2    1X",
        "XXXOOXXX"
    ],
    "random0": [
        "XXXPX",
        "O X1P",
        "O2X X",
        "D X X",
        "XXXSX"
    ]
};
let main_trial_order =
    ["cramped_room", "asymmetric_advantages", "coordination_ring", "random3", "random0"];
// let main_trial_order =
//     ["random0", "cramped_room"];



$(document).ready(() => {
    /*
     * Requires:
     *     psiTurk.js
     *     utils.js
     */
    let participant_id = randomstring.generate({
      length: 12,
      charset: 'alphabetic'
    });
    // `condition` is passed by the psiturk server process
    var condition_name = Conditions.condition_names[condition];
    console.log("Condition: " + condition_name);
    EXP.PLAYER_INDEX = Number(condition_name.split('-')[1]);
    EXP.MODEL_TYPE = condition_name.split('-')[0];
    let AGENT_INDEX = 1 - EXP.PLAYER_INDEX;

    // Randomize the order of trials
    shuffle(main_trial_order);
    console.log("main_trial_order: "+main_trial_order);

    var DEBUG = false;

    // Initalize psiTurk object
    var psiTurk = new PsiTurk(uniqueId, adServerLoc, mode);
    window.psiTurk = psiTurk;

    // All pages to be loaded
    var pages_to_preload = [
        "exp/pageblock.html",
        "exp/complete.html",
        "debug_initpage.html"
    ];
    psiTurk.preloadPages(pages_to_preload);
    psiTurk.preloadImages([]);

    psiTurk.recordUnstructuredData("main_trial_order", main_trial_order);
    // psiTurk.saveData();

    /***********************************
        Set up conditions and blocks
    ************************************/

    var instructions;

    var setup_exp_pages = function () {
        psiTurk.recordUnstructuredData("participant_id", participant_id);

        /***********************************
               Set up websockets server
         ***********************************/
        let HOST = "https://lit-mesa-15330.herokuapp.com/".replace(/^http/, "ws");
        let gameserverio = new GameServerIO({HOST});

        /************************
         Pre-task and training
         ************************/
        var pre_task_pages = [
            // Instructions
            {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    $("#pageblock").addClass("center");
                    $("#pageblock").css("width", "500px");

                    $(".instructionsnav").hide();
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>
                                Hello! In this task, you will be playing a
                                cooking game. You will play one of two chefs
                                in a restaurant that serves onion soup.
                            </p>
                            <p>
                                This is what one level of the game looks like:
                            </p>
                            <img src="/static/images/training0.png" style="width:400px">
                            <p>
                                There are a number of objects in the game, labeled here:
                            </p>
                            <img src="/static/images/training0-annotated.png" style="width:500px">

                            <br>
                            <hr>
                            <br>

                            <h3>Movement and interactions</h3>
                            <img src="/static/images/space-arrows.png" style="width:250px">
                            <p>
                                You can move up, down, left, and right using
                                the <b>arrow keys</b>. You can turn left and right using
                                the <b>arrow keys</b> as well.
                            </p>
                            <p>
                                You can pick up and place objects using the <b>spacebar</b>.
                            </p>
                            <p>
                                You can interact with objects by facing them and pressing
                                <b>spacebar</b>. Here are some examples:
                                <ul>
                                <li>You can pick up onions by facing
                                the onion area and pressing <b>spacebar</b>.</li>
                                <li>If you are holding an onion, are facing an empty counter,
                                and press <b>spacebar</b>, you put the onion on the counter.</li>
                                <li>If you are holding an onion, are facing a pot that is not full,
                                and press <b>spacebar</b>, you will put the onion in the pot.</li>
                                </ul>
                            </p>

                            <br>
                            <br>
                            <p>
                                Note that as you and your partner are moving around the kitchen
                                you <u><b>cannot occupy the same location</b></u>.
                            </p>
                            <br>
                            <hr>
                            <br>

                            <h3>Cooking</h3>
                            <img src="/static/images/soup.png" style="width:250px">
                            <p>
                                Once 3 onions are in the pot, the soup begins to cook.
                                After the timer gets to 20, the soup
                                will be ready to be served. To serve the soup,
                                bring a dish over and interact with the pot.
                            </p>

                            <br>
                            <hr>
                            <br>

                            <h3>Serving</h3>
                            <img src="/static/images/serving-counter.png" style="width:500px">
                            <p>
                            Once the soup is in a bowl, you can serve it by bringing it to
                            a grey serving counter.
                            </p>

                            <br>
                            <hr>
                            <br>

                            <h3>Goal</h3>
                            <img src="/static/images/info-panel.png" style="width:150px">
                            <p>
                            Your goal in this task is to serve as many of the orders as you can
                            before each level ends.  Serving an order gets you
                            ${EXP.DELIVERY_POINTS} points and 1 point adds 1 cent to your bonus.
                            The current order list, score, and time left for you and your partner
                            are shown in the upper left.
                            </p>

                            <br>
                            <hr>
                            <br>

                            <h3>Practice Rounds</h3>
                            <p>
                            We will give you two simple collaborative practice rounds with a computer partner to help you
                            familiarize yourself with the game.
                            </p>

                            <br>
                            <hr>
                            <br>

                            <h3>Final Instructions</h3>
                            <p>Afterwards, in the main part of this task, you will be paired up with a computer partner on 5 harder kitchen layouts, 
                            and you must collaborate with them to play the game. For each layout, you will be paired with two different partners. You will be asked to 
                            evaluate each partner and select your preferred partner. </p>
                            <br>
                            <p>Good luck! Click continue to proceed to the first practice round. Continue button will appear after 15 seconds.</p>
                            </div>
                        `
                    });
                    setTimeout(() => {
                        $(".instructionsnav").show();
                    }, 15000)
                }
            },

            //Scaffolded Training
            {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function() {
                    $(".instructionsnav").hide();
                    $("#pageblock").html(`<h2>Practice: Transport Onions to Cook Soup</h2><p>Pick up and place three onions into the pot. Continue button will appear once complete.</mark> </strong></p>`);
                    let start_grid = [
                        "XXXXOXXXXXX",
                        "XXXX  XXXXX",
                        "XXXX  XXXXX",
                        "X1       PX",
                        "XXXXXXXXXXX",
                    ];
                    let npc_policy = (function() {
                        let a_seq = [
                            STAY, STAY, STAY, STAY, STAY,
                        ];
                        let ai = 0;
                        let pause = 2;
                        return (s) => {
                            let a = STAY;
                            if (((ai/pause) < a_seq.length) && (ai % pause === 0)) {
                                a = a_seq[ai/pause];
                            }
                            ai += 1;
                            return a
                        }
                    })();
                    let game = new OvercookedSinglePlayerScaffoldOneTask({
                        container_id: "pageblock",
			            player_index: 0,
                        start_grid : start_grid,
                        npc_policies: {1:npc_policy},
                        // npc_policies: {1: {0:npc_policy, 1:npc_policy}},
                        TIMESTEP : EXP.TIMESTEP_LENGTH,
                        MAX_TIME : train_time, //seconds
                        init_orders: ['onion'],
                        completion_callback: () => {
                            psiTurk.saveData();
                            setTimeout(() => {
                                $(".instructionsnav").show();
                            }, 1500);
                        },
                        timestep_callback: (data) => {
                            data.participant_id = participant_id;
                            data.layout_name = "scaffold1";
                            data.layout = start_grid;
                            data.round_num = 0;
                            data.round_type = 'training';
                            psiTurk.recordTrialData(data);
                            is_leader = data.is_leader;
                        },
                        DELIVERY_REWARD: EXP.DELIVERY_POINTS
                    });
                    $("#pageblock").css("text-align", "center");
                    game.init();
                }
            },
            {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function() {
                    $(".instructionsnav").hide();
                    $("#pageblock").html(`<h2>Practice: Pickup Soup and Serve</h2><p>Your partner (Blue) will place three onions into the pot to cook the soup. Pick up a plate and serve the soup at the GRAY counter. Continue button will appear once complete.</mark> </strong></p>`);

                    let start_grid = [
                        "XXXXXXX",
                        "XXXOXXX",
                        "X2    X",
                        "XPXXXXX",
                        "X XXXXX",
                        "X    1S",
                        "XDXXXXX",
                        "XXXXXXX",
                    ];
                    let npc_policy = (function() {
                        let a_seq = [
                            STAY, STAY, STAY, STAY, STAY,

                            //get 3 onions
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, SOUTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, SOUTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, SOUTH, INTERACT,
                        ];
                        let ai = 0;
                        let pause = 2;
                        return (s) => {
                            let a = STAY;
                            if (((ai/pause) < a_seq.length) && (ai % pause === 0)) {
                                a = a_seq[ai/pause];
                            }
                            ai += 1;
                            return a
                        }
                    })();
                    let game = new OvercookedSinglePlayerScaffoldTwoTask({
                        container_id: "pageblock",
			            player_index: 0,
                        start_grid : start_grid,
                        npc_policies: {1:npc_policy},
                        // npc_policies: {1: {0:npc_policy, 1:npc_policy}},
                        TIMESTEP : EXP.TIMESTEP_LENGTH,
                        MAX_TIME : train_time, //seconds
                        init_orders: ['onion'],
                        completion_callback: () => {
                            psiTurk.saveData();
                            setTimeout(() => {
                                $(".instructionsnav").show();
                            }, 1500);
                        },
                        timestep_callback: (data) => {
                            data.participant_id = participant_id;
                            data.layout_name = "scaffold2";
                            data.layout = start_grid;
                            data.round_num = 0;
                            data.round_type = 'training';
                            psiTurk.recordTrialData(data);
                            is_leader = data.is_leader;
                        },
                        DELIVERY_REWARD: EXP.DELIVERY_POINTS
                    });
                    $("#pageblock").css("text-align", "center");
                    game.init();
                }
            },

            //Partner Training
            {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    $("#pageblock").addClass("center");
                    $("#pageblock").css("width", "500px");
                    psiTurk.recordUnstructuredData('PLAYER_INDEX', EXP.PLAYER_INDEX);
                    psiTurk.recordUnstructuredData('MODEL_TYPE', EXP.MODEL_TYPE);
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>In Practice Round 1, you (Green) will cook soups and bring them to your partner, Partner X (Blue),
                            who will bring them to be served.</p>
                            </div>
                        `
                    });
                }
            },

            {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function() {
                    $(".instructionsnav").hide();
                    $("#pageblock").html(`<h2>Practice Round 1: Collaborate</h2><p>Cook soups and bring them to your partner (Blue), who will bring them to be served.</mark> </strong></p>`);

                    let npc_policy = (function() {
                        return (s) => {
                            let npc_loc = s.players[1].position;
                            let npc_or = s.players[1].orientation;
                            let npc_holding = typeof(s.players[1].held_object) !== 'undefined';

                            let npc_at_pickup = _.isEqual(npc_loc, [4, 2]) && _.isEqual(npc_or, [-1, 0])
                            let npc_holding_soup = npc_holding && s.players[1].held_object.name === 'soup';
                            let soup_on_counter = typeof(s.objects[[3, 2]]) !== 'undefined' &&
                                s.objects[[3,2]].name === 'soup';
                            let npc_at_server = _.isEqual(npc_loc, [5, 2]) && _.isEqual(npc_or, [1, 0])

                            let a = WEST;
                            if (npc_at_pickup && !npc_holding_soup && soup_on_counter) {
                                a = INTERACT;
                            }
                            else if (npc_holding_soup && !npc_at_server) {
                                a = EAST;
                            }
                            else if (npc_holding_soup && npc_at_server) {
                                a = INTERACT;
                            }
                            return a
                        }
                    })();

                    let start_grid = [
                        "XXXXXXX",
                        "XPDXXXX",
                        "O1 X2 S",
                        "XXXXXXX"
                    ];

                    let game = new OvercookedSinglePlayerTrainingTask({
                        container_id: "pageblock",
			player_index: 0,
                        start_grid : start_grid,
                        npc_policies: {1: npc_policy},
                        // npc_policies: {1: {0:npc_policy, 1:npc_policy}},
                        // npc_policies = {1: {0:npc_policy, 1:npc_policy} },
                        TIMESTEP : EXP.TIMESTEP_LENGTH,
                        MAX_TIME : train_time, //seconds
                        init_orders: ['onion'],
                        always_serve: 'onion',
                        completion_callback: () => {
                            psiTurk.saveData();
                            setTimeout(() => {
                                $(".instructionsnav").show();
                            }, 1500);
                        },
                        timestep_callback: (data) => {
                            data.participant_id = participant_id;
                            data.layout_name = "training1";
                            data.layout = start_grid;
                            data.round_num = 0;
                            data.round_type = 'training';
                            psiTurk.recordTrialData(data);
                        },
                        DELIVERY_REWARD: EXP.DELIVERY_POINTS
                    });
                    $("#pageblock").css("text-align", "center");
                    game.init();
                }
            },

            {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    $("#pageblock").addClass("center");
                    $("#pageblock").css("width", "500px");
                    psiTurk.recordUnstructuredData('PLAYER_INDEX', EXP.PLAYER_INDEX);
                    psiTurk.recordUnstructuredData('MODEL_TYPE', EXP.MODEL_TYPE);
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>In Practice Round 2, you (Green) will cook soups and serve them by yourself. Your partner, Partner X (Blue),
                            will do the same.</p>
                            </div>
                        `
                    });
                }
            },



            // Training
            {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function() {
                    $(".instructionsnav").hide();
                    $("#pageblock").html(`<h2>Practice Round 2: Collaborate</h2><p>You (Green) and your partner (Blue) will each cook soups and serve them.</mark> </strong></p>`);

                    let npc_policy = (function() {
                        let a_seq = [
                            //Round 1
                            STAY, STAY, STAY, STAY, STAY,

                            //get 3 onions
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,

                            //get a dish while it is cooking and wait
                            EAST, EAST, EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, WEST, WEST, NORTH,
                            STAY, STAY, STAY, INTERACT,

                            //deliver to server
                            EAST, EAST, EAST, EAST, INTERACT,

                            // Round 2
                            STAY, STAY, STAY, STAY, STAY,

                            //get 3 onions
                            WEST, WEST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,

                            //get a dish while it is cooking and wait
                            EAST, EAST, EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, WEST, WEST, NORTH,
                            STAY, STAY, STAY, INTERACT,

                            //deliver to server
                            EAST, EAST, EAST, EAST, INTERACT,
                            STAY, STAY, STAY, STAY, STAY,

                            //get 3 onions
                            WEST, WEST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,

                            //get a dish while it is cooking and wait
                            EAST, EAST, EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, WEST, WEST, NORTH,
                            STAY, STAY, STAY, INTERACT,

                            //deliver to server
                            EAST, EAST, EAST, EAST, INTERACT,

                            //ROUND 3
                            STAY, STAY, STAY, STAY, STAY,

                            //get 3 onions
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,

                            //get a dish while it is cooking and wait
                            EAST, EAST, EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, WEST, WEST, NORTH,
                            STAY, STAY, STAY, INTERACT,

                            //deliver to server
                            EAST, EAST, EAST, EAST, INTERACT,

                            // Round 4
                            STAY, STAY, STAY, STAY, STAY,

                            //get 3 onions
                            WEST, WEST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,

                            //get a dish while it is cooking and wait
                            EAST, EAST, EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, WEST, WEST, NORTH,
                            STAY, STAY, STAY, INTERACT,

                            //deliver to server
                            EAST, EAST, EAST, EAST, INTERACT,
                            STAY, STAY, STAY, STAY, STAY,

                            //get 3 onions
                            WEST, WEST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,
                            EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, NORTH, INTERACT,

                            //get a dish while it is cooking and wait
                            EAST, EAST, EAST, EAST, NORTH, INTERACT,
                            WEST, WEST, WEST, WEST, NORTH,
                            STAY, STAY, STAY, INTERACT,

                            //deliver to server
                            EAST, EAST, EAST, EAST, INTERACT,

                            //put an onion on the table
                            // WEST, WEST, NORTH, INTERACT, SOUTH, INTERACT
                        ];
                        let ai = 0;
                        let pause = 2;
                        return (s) => {
                            let a = STAY;
                            if (((ai/pause) < a_seq.length) && (ai % pause === 0)) {
                                a = a_seq[ai/pause];
                            }
                            ai += 1;
                            return a
                        }
                    })();
                    let start_grid = [
                        "XXXXXXX",
                        "XPXOXDX",
                        "X2    S",
                        "XPXOXDX",
                        "X    1S",
                        "XXXXXXX"
                    ];

                    let game = new OvercookedSinglePlayerTrainingTask({
                        container_id: "pageblock",
			            player_index: 0,
                        start_grid : start_grid,
                        npc_policies: {1: npc_policy},
                        // npc_policies: {1: {0:npc_policy, 1:npc_policy}},
                        TIMESTEP : EXP.TIMESTEP_LENGTH,
                        MAX_TIME : train_time, //seconds
                        init_orders: ['onion'],
                        completion_callback: () => {
                            psiTurk.saveData();
                            setTimeout(() => {
                                $(".instructionsnav").show();
                            }, 1500);
                        },
                        timestep_callback: (data) => {
                            data.participant_id = participant_id;
                            data.layout_name = "training2";
                            data.layout = start_grid;
                            data.round_num = 0;
                            data.round_type = 'training';
                            psiTurk.recordTrialData(data);
                            is_leader = data.is_leader;
                        },
                        DELIVERY_REWARD: EXP.DELIVERY_POINTS
                    });
                    $("#pageblock").css("text-align", "center");
                    game.init();
                }
            },


            {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    $("#pageblock").addClass("center");
                    $("#pageblock").css("width", "500px");
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>Great job! Now you will be paired up with two
                            computer partners for a set of five kitchen layouts. You will 
                            asked to evaluate each collaboration and select a preferred partner between the two for each 
                            layout.</p>
                            </div>
                        `
                    });
                }
            }
        ];

        /*********
         Main task
         *********/
        var agent_names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']

        var task_pages = _.map(_.range(main_trial_order.length), (round_num) => {
            var random_p = Math.random();
            var agent_order = ['ppo_bc', 'ppo_adapt'];
            if (random_p <= 0.5){
                agent_order = ['ppo_adapt', 'ppo_bc'];
            }

            let round_page = {
                'pagename': 'exp/pageblock.html',
                'pagefunc': () => {
                    $('#next').addClass('instructionshidden');
                    $('#next').removeClass('instructionsshown');
                    $("#pageblock").html(`<h2>Round ${round_num + 1}</h2>`);
                    setTimeout(() => {
                        $("#next").click()
                    }, 1000);
                }
            }
            let instruct1 = {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    $("#pageblock").addClass("center");
                    $("#pageblock").css("width", "500px");
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>In the next map, you (Green) will collaborate with <strong><mark>Partner ${agent_names[(round_num*2)]} (Blue).</mark> </strong></p>
                            <img src="../static/assets/blue_agent.png" alt="Agent" style="width:100px;">
                            </div>
                        `
                    });
                }
            }


            let game_page_no_adapt = {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function () {
                    $(".instructionsnav").hide();
                    $("#pageblock").html(`<p>Playing with <strong><mark>Partner ${agent_names[(round_num*2)]}.</mark> </strong></p>`);
                    let layout_name = main_trial_order[round_num];
		    getOvercookedPolicy("ppo_bc", layout_name, AGENT_INDEX).then(function(npc_policy) {

			let npc_policies = {};
			npc_policies[AGENT_INDEX] = npc_policy;
                        let game = new OvercookedSinglePlayerNoAdaptTask({
                            container_id: "pageblock",
			    player_index: EXP.PLAYER_INDEX,
                            start_grid : layouts[layout_name],
			    npc_policies: npc_policies,
                            TIMESTEP : EXP.TIMESTEP_LENGTH,
                            MAX_TIME : EXP.MAIN_TRIAL_TIME, //seconds
                            init_orders: ['onion'],
                            always_serve: 'onion',
                            completion_callback: () => {
                                setTimeout(() => {
                                    $("#next").click()
                                }, 1500);
                            },
                            timestep_callback: (data) => {
                                data.participant_id = participant_id;
                                data.layout_name = layout_name;
                                data.layout = layouts[layout_name];
                                data.round_num = round_num;
                                data.round_type = 'main';
                                data.agent_type = agent_order[0];
                                data.agent_letter = agent_names[(round_num*2)];
                                psiTurk.recordTrialData(data);
                                // console.log(data);
                                console.log(data);
                                if (data.reward > 0) {
                                    worker_bonus += EXP.POINT_VALUE*data.reward;
                                }
                            },
                            DELIVERY_REWARD: EXP.DELIVERY_POINTS
                        });
                        $("#pageblock").css("text-align", "center");
                        window.exit_hit = () => {
                            psiTurk.recordUnstructuredData("early_exit", true);
                            psiTurk.recordUnstructuredData('bonus_calc', worker_bonus);
                            psiTurk.recordUnstructuredData('is_leader', is_leader);
                            psiTurk.saveData({
                                success: () =>  {
                                    console.log("Data sent");
                                    setTimeout(function () {
                                        instructions.finish();
                                    }, 1000);
                                }
                            });
                        }
                        game.init();
                    });
                }
            }
            let post_game_1 = [
            {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.add([
                        {
                            type: 'textdisplay',
                            questiontext: `
                                <h3>Survey: Please evaluate your collaboration with Partner ${agent_names[(round_num*2)]}.</h3>
                            `
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'fluency-A-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2)],
                            questiontext: `Partner ${agent_names[(round_num*2)]} and I coordinated our actions well together.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'fluency_over_time-A-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2)],
                            questiontext: `Partner ${agent_names[(round_num*2)]} and I coordinated our actions better over the course of the episode.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'contribution-A-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2)],
                            questiontext: `Evaluate the relative contribution of each member of the team.`,
                            options: [
                                {value: '1', optiontext: `Partner ${agent_names[(round_num*2)]} contributed significantly more than me to the team performance.`},
                                {value: '2', optiontext: `Partner ${agent_names[(round_num*2)]} contributed somewhat more than me to the team performance.`},
                                {value: '3', optiontext: `Partner ${agent_names[(round_num*2)]} and I contributed equally to the team performance.`},
                                {value: '4', optiontext: `I contributed somewhat more than Partner ${agent_names[(round_num*2)]} to the team performance.`},
                                {value: '5', optiontext: `I contributed significantly more than Partner ${agent_names[(round_num*2)]} to the team performance.`},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'subgoals-A-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2)],
                            questiontext: `Partner ${agent_names[(round_num*2)]} perceived accurately what tasks I was trying to accomplish.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'predictable-A-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2)],
                            questiontext: `I was able to understand and predict what tasks Partner ${agent_names[(round_num*2)]} was trying to accomplish.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },
                    ]);
                    $("#pageblock").css("text-align", "center");
                    window.save_data = () => {
                        psiTurk.saveData({
                            success: (data) =>  {
                                setTimeout(function () {
                                    $("#next").click();
                                }, 2000);
                                console.log(data);
                                // $("#saving_msg").html("Success!");
                                console.log("Data sent");
                            }
                        });
                    };

                    // window.save_data();
                    $("#next").click(function(){
                        window.save_data();
                        // alert("Next button was clicked.");

                    });
                }
            },



        ]

            let instruct2 = {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    $("#pageblock").addClass("center");
                    $("#pageblock").css("width", "500px");
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>In the next map, you (Green) will collaborate with <strong><mark>Partner ${agent_names[(round_num*2 + 1)]} (Blue).</mark> </strong></p>
                            <img src="../static/assets/blue_agent.png" alt="Agent" style="width:100px;">
                            </div>
                        `
                    });
                }
            }

            let game_page_adapt = {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function () {
                    $(".instructionsnav").hide();
                    $("#pageblock").html(`<p>Playing with <strong><mark>Partner ${agent_names[(round_num*2+1)]}.</mark> </strong></p>`);
                    let layout_name = main_trial_order[round_num];
                    console.log("layout name: "+layout_name);

                    if (layout_name === "random0"){
                        getOvercookedPolicy("ppo_adapt", layout_name+'_strat0', AGENT_INDEX).then(function (npc_policy_1) {
                            getOvercookedPolicy("ppo_adapt", layout_name+'_strat1', AGENT_INDEX).then(function(npc_policy_2) {

                                let npc_policies = {};
                                npc_policies[AGENT_INDEX] = {0:npc_policy_1, 1:npc_policy_2};
                                let game = new OvercookedSinglePlayerTask_AdaptTwoStrategy({
                                    container_id: "pageblock",
                                    player_index: EXP.PLAYER_INDEX,
                                    start_grid : layouts[layout_name],
                                    npc_policies: npc_policies,
                                    TIMESTEP : EXP.TIMESTEP_LENGTH,
                                    MAX_TIME : EXP.MAIN_TRIAL_TIME, //seconds
                                    init_orders: ['onion'],
                                    always_serve: 'onion',
                                    completion_callback: () => {
                                        setTimeout(() => {
                                            $("#next").click()
                                        }, 1500);
                                    },
                                    timestep_callback: (data) => {
                                        data.participant_id = participant_id;
                                        data.layout_name = layout_name;
                                        data.layout = layouts[layout_name];
                                        data.round_num = round_num;
                                        data.round_type = 'main';
                                        data.agent_type = agent_order[1];
                                        data.agent_letter = agent_names[(round_num*2+1)];
                                        psiTurk.recordTrialData(data);
                                        // console.log(data);
                                        if (data.reward > 0) {
                                            worker_bonus += EXP.POINT_VALUE*data.reward;
                                        }
                                        // data.worker_bonus = worker_bonus
                                    },
                                    DELIVERY_REWARD: EXP.DELIVERY_POINTS
                                });


                                $("#pageblock").css("text-align", "center");
                                window.exit_hit = () => {
                                    psiTurk.recordUnstructuredData("early_exit", true);
                                    psiTurk.recordUnstructuredData('bonus_calc', worker_bonus);
                                    psiTurk.recordUnstructuredData('is_leader', is_leader);
                                    psiTurk.saveData({
                                        success: () =>  {
                                            console.log("Data sent");
                                            setTimeout(function () {
                                                instructions.finish();
                                            }, 1000);
                                        }
                                    });
                                }
                                game.init();
                            })
                        });
                    }
                    else if (layout_name === "asymmetric_advantages"){
                        getOvercookedPolicy("ppo_adapt", layout_name+'_strat0', AGENT_INDEX).then(function (npc_policy_1) {
                            getOvercookedPolicy("ppo_adapt", layout_name+'_strat1', AGENT_INDEX).then(function(npc_policy_2) {
                                // $(".instructionsnav").hide();
                                let npc_policies = {};
                                npc_policies[AGENT_INDEX] = {0:npc_policy_1, 1:npc_policy_2};
                                let game = new OvercookedSinglePlayerTask_AdaptTwoStrategy({
                                    container_id: "pageblock",
                                    player_index: EXP.PLAYER_INDEX,
                                    start_grid : layouts[layout_name],
                                    npc_policies: npc_policies,
                                    TIMESTEP : EXP.TIMESTEP_LENGTH,
                                    MAX_TIME : EXP.MAIN_TRIAL_TIME, //seconds
                                    init_orders: ['onion'],
                                    always_serve: 'onion',
                                    completion_callback: () => {
                                        setTimeout(() => {
                                            $("#next").click()
                                        }, 1500);
                                    },
                                    timestep_callback: (data) => {
                                        data.participant_id = participant_id;
                                        data.layout_name = layout_name;
                                        data.layout = layouts[layout_name];
                                        data.round_num = round_num;
                                        data.round_type = 'main';
                                        data.agent_type = agent_order[1];
                                        data.agent_letter = agent_names[(round_num*2+1)];
                                        psiTurk.recordTrialData(data);
                                        // console.log(data);
                                        if (data.reward > 0) {
                                            worker_bonus += EXP.POINT_VALUE*data.reward;
                                        }
                                        // data.worker_bonus = worker_bonus
                                    },
                                    DELIVERY_REWARD: EXP.DELIVERY_POINTS
                                });


                                $("#pageblock").css("text-align", "center");
                                window.exit_hit = () => {
                                    psiTurk.recordUnstructuredData("early_exit", true);
                                    psiTurk.recordUnstructuredData('bonus_calc', worker_bonus);
                                    psiTurk.recordUnstructuredData('is_leader', is_leader);
                                    psiTurk.saveData({
                                        success: () =>  {
                                            console.log("Data sent");
                                            setTimeout(function () {
                                                instructions.finish();
                                            }, 1000);
                                        }
                                    });
                                }
                                game.init();
                            })
                        });
                    }
                    else if (layout_name === "cramped_room"){
                        getOvercookedPolicy("ppo_adapt", layout_name+'_strat0', AGENT_INDEX).then(function (npc_policy_1) {
                            getOvercookedPolicy("ppo_adapt", layout_name+'_strat1', AGENT_INDEX).then(function(npc_policy_2) {
                                getOvercookedPolicy("ppo_adapt", layout_name+'_strat2', AGENT_INDEX).then(function (npc_policy_3) {
                                    getOvercookedPolicy("ppo_adapt", layout_name+'_strat3', AGENT_INDEX).then(function(npc_policy_4) {
                                        // $(".instructionsnav").hide();
                                        let npc_policies = {};
                                        npc_policies[AGENT_INDEX] = {0:npc_policy_1, 1:npc_policy_2, 2:npc_policy_3, 3:npc_policy_4};
                                        let game = new OvercookedSinglePlayerTask_AdaptFourStrategy({
                                            container_id: "pageblock",
                                            player_index: EXP.PLAYER_INDEX,
                                            start_grid : layouts[layout_name],
                                            npc_policies: npc_policies,
                                            TIMESTEP : EXP.TIMESTEP_LENGTH,
                                            MAX_TIME : EXP.MAIN_TRIAL_TIME, //seconds
                                            init_orders: ['onion'],
                                            always_serve: 'onion',
                                            completion_callback: () => {
                                                setTimeout(() => {
                                                    $("#next").click()
                                                }, 1500);
                                            },
                                            timestep_callback: (data) => {
                                                data.participant_id = participant_id;
                                                data.layout_name = layout_name;
                                                data.layout = layouts[layout_name];
                                                data.round_num = round_num;
                                                data.round_type = 'main';
                                                data.agent_type = agent_order[1];
                                                data.agent_letter = agent_names[(round_num*2+1)];
                                                psiTurk.recordTrialData(data);
                                                // console.log(data);
                                                if (data.reward > 0) {
                                                    worker_bonus += EXP.POINT_VALUE*data.reward;
                                                }
                                                // data.worker_bonus = worker_bonus
                                            },
                                            DELIVERY_REWARD: EXP.DELIVERY_POINTS
                                        });


                                        $("#pageblock").css("text-align", "center");
                                        window.exit_hit = () => {
                                            psiTurk.recordUnstructuredData("early_exit", true);
                                            psiTurk.recordUnstructuredData('bonus_calc', worker_bonus);
                                            psiTurk.recordUnstructuredData('is_leader', is_leader);
                                            psiTurk.saveData({
                                                success: () =>  {
                                                    console.log("Data sent");
                                                    setTimeout(function () {
                                                        instructions.finish();
                                                    }, 1000);
                                                }
                                            });
                                        }
                                        game.init();
                                    })
                                })
                            })
                        });
                    }
                    else if (layout_name === "coordination_ring"){
                        getOvercookedPolicy("ppo_adapt", layout_name+'_strat0', AGENT_INDEX).then(function (npc_policy_1) {
                            getOvercookedPolicy("ppo_adapt", layout_name+'_strat1', AGENT_INDEX).then(function(npc_policy_2) {
                                // $(".instructionsnav").hide();
                                let npc_policies = {};
                                npc_policies[AGENT_INDEX] = {0:npc_policy_1, 1:npc_policy_2};
                                let game = new OvercookedSinglePlayerTask_AdaptTwoStrategy({
                                    container_id: "pageblock",
                                    player_index: EXP.PLAYER_INDEX,
                                    start_grid : layouts[layout_name],
                                    npc_policies: npc_policies,
                                    TIMESTEP : EXP.TIMESTEP_LENGTH,
                                    MAX_TIME : EXP.MAIN_TRIAL_TIME, //seconds
                                    init_orders: ['onion'],
                                    always_serve: 'onion',
                                    completion_callback: () => {
                                        setTimeout(() => {
                                            $("#next").click()
                                        }, 1500);
                                    },
                                    timestep_callback: (data) => {
                                        data.participant_id = participant_id;
                                        data.layout_name = layout_name;
                                        data.layout = layouts[layout_name];
                                        data.round_num = round_num;
                                        data.round_type = 'main';
                                        data.agent_type = agent_order[1];
                                        data.agent_letter = agent_names[(round_num*2+1)];
                                        psiTurk.recordTrialData(data);
                                        // console.log(data);
                                        if (data.reward > 0) {
                                            worker_bonus += EXP.POINT_VALUE*data.reward;
                                        }
                                        // data.worker_bonus = worker_bonus
                                    },
                                    DELIVERY_REWARD: EXP.DELIVERY_POINTS
                                });


                                $("#pageblock").css("text-align", "center");
                                window.exit_hit = () => {
                                    psiTurk.recordUnstructuredData("early_exit", true);
                                    psiTurk.recordUnstructuredData('bonus_calc', worker_bonus);
                                    psiTurk.recordUnstructuredData('is_leader', is_leader);
                                    psiTurk.saveData({
                                        success: () =>  {
                                            console.log("Data sent");
                                            setTimeout(function () {
                                                instructions.finish();
                                            }, 1000);
                                        }
                                    });
                                }
                                game.init();
                            })
                        });
                    }
                    else if (layout_name === "random3"){
                        getOvercookedPolicy("ppo_adapt", layout_name+'_strat0', AGENT_INDEX).then(function (npc_policy_1) {
                            getOvercookedPolicy("ppo_adapt", layout_name+'_strat1', AGENT_INDEX).then(function(npc_policy_2) {
                                getOvercookedPolicy("ppo_adapt", layout_name+'_strat2', AGENT_INDEX).then(function (npc_policy_3) {
                                    getOvercookedPolicy("ppo_adapt", layout_name+'_strat3', AGENT_INDEX).then(function(npc_policy_4) {
                                        // $(".instructionsnav").hide();
                                        let npc_policies = {};
                                        npc_policies[AGENT_INDEX] = {0:npc_policy_1, 1:npc_policy_2, 2:npc_policy_3, 3:npc_policy_4};
                                        let game = new OvercookedSinglePlayerTask_AdaptFourStrategy({
                                            container_id: "pageblock",
                                            player_index: EXP.PLAYER_INDEX,
                                            start_grid : layouts[layout_name],
                                            npc_policies: npc_policies,
                                            TIMESTEP : EXP.TIMESTEP_LENGTH,
                                            MAX_TIME : EXP.MAIN_TRIAL_TIME, //seconds
                                            init_orders: ['onion'],
                                            always_serve: 'onion',
                                            completion_callback: () => {
                                                setTimeout(() => {
                                                    $("#next").click()
                                                }, 1500);
                                            },
                                            timestep_callback: (data) => {
                                                data.participant_id = participant_id;
                                                data.layout_name = layout_name;
                                                data.layout = layouts[layout_name];
                                                data.round_num = round_num;
                                                data.round_type = 'main';
                                                data.agent_type = agent_order[1];
                                                data.agent_letter = agent_names[(round_num*2+1)];
                                                psiTurk.recordTrialData(data);
                                                // console.log(data);
                                                if (data.reward > 0) {
                                                    worker_bonus += EXP.POINT_VALUE*data.reward;
                                                }
                                                // data.worker_bonus = worker_bonus
                                            },
                                            DELIVERY_REWARD: EXP.DELIVERY_POINTS
                                        });


                                        $("#pageblock").css("text-align", "center");
                                        window.exit_hit = () => {
                                            psiTurk.recordUnstructuredData("early_exit", true);
                                            psiTurk.recordUnstructuredData('bonus_calc', worker_bonus);
                                            psiTurk.recordUnstructuredData('is_leader', is_leader);
                                            psiTurk.saveData({
                                                success: () =>  {
                                                    console.log("Data sent");
                                                    setTimeout(function () {
                                                        instructions.finish();
                                                    }, 1000);
                                                }
                                            });
                                        }
                                        game.init();
                                    })
                                })
                            })
                        });
                    }
                }
            }

            let post_game_2 = [
            {
                pagename: 'exp/pageblock.html',
                pagefunc: () => {
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.add([
                        {
                            type: 'textdisplay',
                            questiontext: `
                                <h3>Survey: Please evaluate your collaboration with Partner ${agent_names[(round_num*2 + 1)]}. </h3>
                            `
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'fluency-B-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2 + 1)],
                            questiontext: `Partner ${agent_names[(round_num*2 + 1)]} and I coordinated our actions well together.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'fluency_over_time-B-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2 + 1)],
                            questiontext: `Partner ${agent_names[(round_num*2 + 1)]} and I coordinated our actions better over the course of the episode.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'contribution-A-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2)],
                            questiontext: `Evaluate the relative contribution of each member of the team.`,
                            options: [
                                {value: '1', optiontext: `Partner ${agent_names[(round_num*2)]} contributed significantly more than me to the team performance.`},
                                {value: '2', optiontext: `Partner ${agent_names[(round_num*2)]} contributed somewhat more than me to the team performance.`},
                                {value: '3', optiontext: `Partner ${agent_names[(round_num*2)]} and I contributed equally to the team performance.`},
                                {value: '4', optiontext: `I contributed somewhat more than Partner ${agent_names[(round_num*2)]} to the team performance.`},
                                {value: '5', optiontext: `I contributed significantly more than Partner ${agent_names[(round_num*2)]} to the team performance.`},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'subgoals-B-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2 + 1)],
                            questiontext: `Partner ${agent_names[(round_num*2 + 1)]} perceived accurately what tasks I was trying to accomplish.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'predictable-B-'+ (round_num+1) + '-name_'+ agent_names[(round_num*2 + 1)],
                            questiontext: `I was able to understand and predict what tasks Partner ${agent_names[(round_num*2 + 1)]} was trying to accomplish.`,
                            options: [
                                {value: '1', optiontext: 'Strongly Disagree'},
                                {value: '2', optiontext: 'Disagree'},
                                {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                {value: '4', optiontext: 'Agree'},
                                {value: '5', optiontext: 'Strongly Agree'},
                            ]
                        },

                    ]);
                    $("#pageblock").css("text-align", "center");
                    window.save_data = () => {
                        psiTurk.saveData({
                            success: () =>  {
                                setTimeout(function () {
                                    $("#next").click();
                                }, 2000);
                                // $("#saving_msg").html("Success!");
                                console.log("Data sent");
                            }
                        });
                    };

                    // window.save_data();
                    $("#next").click(function(){
                        window.save_data();
                        // alert("Next button was clicked.");

                    });
                }
            },



        ]

            let preference_survey = [
                {
                    pagename: 'exp/pageblock.html',
                    pagefunc: () => {
                        let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                        survey.add([
                            {
                                type: 'textdisplay',
                                questiontext: `
                                    <h3>Preferred Partner Selection: Please select which partner you preferred to work with.</h3>
                                `
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'preferred_partner'+ (round_num+1),
                                questiontext: 'Which partner did you prefer?',
                                leftalign: false,
                                options: [
                                    {value: 'A', optiontext: `Partner ${agent_names[(round_num*2)]} <p>(1st Round)</p> `},
                                    {value: 'B', optiontext: `Partner ${agent_names[(round_num*2 + 1)]}  <p>(2nd Round)</p> `},
                                ]
                            },
                            {
                                type: 'textdisplay',
                                questiontext: `
                                    <h3>Please explain the reason for your preference.</h3>
                                `
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'more_contribution'+ (round_num+1),
                                questiontext: `The partner I selected contributed more than the other.`,
                                options: [
                                    {value: '1', optiontext: 'Strongly Disagree'},
                                    {value: '2', optiontext: 'Disagree'},
                                    {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                    {value: '4', optiontext: 'Agree'},
                                    {value: '5', optiontext: 'Strongly Agree'},
                                ]
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'more_effective'+ (round_num+1),
                                questiontext: `I collaborated more effectively with the partner I selected than with the other.`,
                                options: [
                                    {value: '1', optiontext: 'Strongly Disagree'},
                                    {value: '2', optiontext: 'Disagree'},
                                    {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                    {value: '4', optiontext: 'Agree'},
                                    {value: '5', optiontext: 'Strongly Agree'},
                                ]
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'more_fluent'+ (round_num+1),
                                questiontext: `I was able to coordinate my actions better with the partner I selected than with the other.`,
                                options: [
                                    {value: '1', optiontext: 'Strongly Disagree'},
                                    {value: '2', optiontext: 'Disagree'},
                                    {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                    {value: '4', optiontext: 'Agree'},
                                    {value: '5', optiontext: 'Strongly Agree'},
                                ]
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'more_predictable'+ (round_num+1),
                                questiontext: `I was better able to understand and predict the actions of the partner I selected than those of the other.`,
                                options: [
                                    {value: '1', optiontext: 'Strongly Disagree'},
                                    {value: '2', optiontext: 'Disagree'},
                                    {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                    {value: '4', optiontext: 'Agree'},
                                    {value: '5', optiontext: 'Strongly Agree'},
                                ]
                            },

                        ]);
                        $("#pageblock").css("text-align", "center");
                        window.save_data = () => {

                            psiTurk.saveData({
                                success: () =>  {
                                    setTimeout(function () {
                                        $("#next").click();
                                    }, 2000);
                                    // $("#saving_msg").html("Success!");
                                    console.log("Data sent");
                                }
                            });
                        };

                        // window.save_data();
                        $("#next").click(function(){
                            window.save_data();
                            // alert("Next button was clicked.");

                        });

                    }
                },
            ]

            if (agent_order[0] === "ppo_adapt"){
                preference_survey = [
                {
                    pagename: 'exp/pageblock.html',
                    pagefunc: () => {
                        let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                        survey.add([
                            {
                                type: 'textdisplay',
                                questiontext: `
                                    <h3>Preferred Partner Selection: Please select which partner you preferred to work with.</h3>
                                `
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'preferred_partner'+ (round_num+1),
                                questiontext: 'Which partner did you prefer?',
                                leftalign: false,
                                options: [
                                    {value: 'A', optiontext: `Partner ${agent_names[(round_num*2 + 1)]}  <p>(1st Round)</p> `},
                                    {value: 'B', optiontext: `Partner ${agent_names[(round_num*2)]} <p>(2nd Round)</p> `},
                                ]
                            },
                            {
                                type: 'textdisplay',
                                questiontext: `
                                    <h3>Please explain the reason for your preference.</h3>
                                `
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'more_contribution'+ (round_num+1),
                                questiontext: `The partner I selected contributed more than the other.`,
                                options: [
                                    {value: '1', optiontext: 'Strongly Disagree'},
                                    {value: '2', optiontext: 'Disagree'},
                                    {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                    {value: '4', optiontext: 'Agree'},
                                    {value: '5', optiontext: 'Strongly Agree'},
                                ]
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'more_fluent'+ (round_num+1),
                                questiontext: `I was able to coordinate my actions better with the partner I selected than with the other.`,
                                options: [
                                    {value: '1', optiontext: 'Strongly Disagree'},
                                    {value: '2', optiontext: 'Disagree'},
                                    {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                    {value: '4', optiontext: 'Agree'},
                                    {value: '5', optiontext: 'Strongly Agree'},
                                ]
                            },
                            {
                                type: 'horizontal-radio',
                                name: 'more_predictable'+ (round_num+1),
                                questiontext: `I was better able to understand and predict the actions of the partner I selected than those of the other.`,
                                options: [
                                    {value: '1', optiontext: 'Strongly Disagree'},
                                    {value: '2', optiontext: 'Disagree'},
                                    {value: '3', optiontext: 'Neither Agree Nor Disagree'},
                                    {value: '4', optiontext: 'Agree'},
                                    {value: '5', optiontext: 'Strongly Agree'},
                                ]
                            },

                        ]);
                        $("#pageblock").css("text-align", "center");
                        window.save_data = () => {

                            psiTurk.saveData({
                                success: () =>  {
                                    setTimeout(function () {
                                        $("#next").click();
                                    }, 2000);
                                    // $("#saving_msg").html("Success!");
                                    console.log("Data sent");
                                }
                            });
                        };

                        // window.save_data();
                        $("#next").click(function(){
                            window.save_data();
                            // alert("Next button was clicked.");

                        });

                    }
                },
            ]
            }

            let output = [round_page, instruct1, game_page_no_adapt, post_game_1, instruct2, game_page_adapt, post_game_2, preference_survey];
            if (agent_order[0] === "ppo_adapt"){
                output = [round_page, instruct2, game_page_adapt, post_game_2, instruct1, game_page_no_adapt, post_game_1, preference_survey];
            }
            // let output = [game_page_adapt];

            return output
        });
        task_pages = _.flattenDeep(task_pages);

        /*********
         Post-task
         *********/
        let post_task_pages = [
            // Demographics
            {
                'pagename': 'exp/pageblock.html',
                'pagefunc': () => {
                    let questions = [
                        {
                            type: 'numeric-text',
                            name: "age",
                            questiontext: 'Age',
                        },
                        {
                            type: 'gender-vertical-radio',
                            name: 'gender',
                            questiontext: 'Gender',
                            options: [
                                {value: '1', optiontext: 'Woman'},
                                {value: '2', optiontext: 'Man'},
                                {value: '3', optiontext: 'Transgender'},
                                {value: '4', optiontext: 'Non-binary/Non-conforming'},
                                {value: '5', optiontext: 'Prefer Not to Respond'},
                                // {value: '6', optiontext: 'Self-describe, below'},
                            ]
                        },
                        // {
                        //     type: 'textbox',
                        //     name: "self-defined-gender",
                        //     questiontext: 'Self-describe:',
                        //     required: false,
                        //     cols: 20,
                        //     rows: 1,
                        //
                        // },
                        {
                            type: 'vertical-radio',
                            name: 'education',
                            questiontext: 'What is the highest level of education you have completed?',
                            options: [
                                {value: '1', optiontext: 'Less than high school'},
                                {value: '2', optiontext: 'High school'},
                                {value: '3', optiontext: 'Some college'},
                                {value: '4', optiontext: '2-year college degree'},
                                {value: '5', optiontext: '4-year college degree'},
                                {value: '6', optiontext: 'Masters degree'},
                                {value: '7', optiontext: 'Professional degree (JD, MD)'},
                                {value: '8', optiontext: 'Doctoral degree'},
                            ]
                        },
                        {
                            type: 'vertical-radio',
                            name: 'gaming_experience',
                            questiontext: 'How often do you play video games?',
                            options: [
                                {value: '1', optiontext: 'Everyday'},
                                {value: '2', optiontext: 'Once or twice a week'},
                                {value: '3', optiontext: 'Once a month'},
                                {value: '4', optiontext: 'Less than once a month'},
                                {value: '5', optiontext: 'Never'},
                            ]
                        },
                    ];
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.add(questions);
                }
            },

            //saving task
            {
                pagename: "exp/pageblock.html",
                pagefunc: () => {
                    $('#next').addClass('instructionshidden');
                    $('#next').removeClass('instructionsshown');
                    psiTurk.recordUnstructuredData('bonus_calc', worker_bonus);
                    psiTurk.recordUnstructuredData('is_leader', is_leader);
                    psiTurk.recordUnstructuredData("early_exit", false);

                    let saving_timeout = setTimeout(() => {
                        $("#saving_msg").html(
                            `
                                <p>Your data is being saved. PLEASE WAIT – DO NOT CLOSE YOUR BROWSER</p>

                                <p>
<!--                                Click the button below to save manually (it may take a second)-->
<!--                                </p>-->
<!--                                <div>-->
<!--                                <button type="button" class="btn btn-primary btn-lg" onclick="save_data();">-->
<!--								  Save-->
<!--								</button>-->
<!--								</div>-->
                                `
                        )
                    }, 30000);
                    window.save_data = () => {

                        psiTurk.saveData({
                            success: () =>  {
                                clearTimeout(saving_timeout);
                                setTimeout(function () {
                                    $("#next").click();
                                }, 2000);
                                $("#saving_msg").html("Your data is being saved. PLEASE WAIT – DO NOT CLOSE YOUR BROWSER");
                                console.log("Data sent");
                            }
                        });
                    };


                    window.save_data();

                    $("#pageblock").html(
                        `
                            <h2>Saving data</h2>
                            <div id="saving_msg">
                                <p>Your data is being saved. PLEASE WAIT – DO NOT CLOSE YOUR BROWSER</p>
<!--                                <p>Please wait while we save your results so we can compute your bonus...</p>-->
<!--                                <p>(This should take less than a minute).</p>-->
<!--                                <p>This page should automatically continue.</p>-->
                            </div>
                        `
                    );
                }
            },

            "exp/complete.html"
        ]

        let exp_pages =
            _.flattenDeep([pre_task_pages, task_pages, post_task_pages])
        // let exp_pages =
        //     _.flattenDeep([pre_task_pages, task_pages])
        instructions = new PageBlockController(
            psiTurk, //parent
            exp_pages, //pages
            undefined, //callback
            undefined, //closeAlert
            true //manual_saveData
        );
    };

    /*******************
     * Run Task
     ******************/
    setup_exp_pages();
    instructions.loadPage();
});
