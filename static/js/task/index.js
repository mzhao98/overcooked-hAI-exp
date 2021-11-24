import $ from "jquery"
import _ from "lodash"
import PageBlockSurveyHandler from "./js/pageblock-survey"
import PageBlockController from "./js/psiturk-pageblock-controller"
import Conditions from "./js/conditions"
import GameServerIO from "./js/gameserver-io"
import OvercookedSinglePlayerTask from "./js/overcooked-single";
import OvercookedSinglePlayerNoAdaptTask from "./js/overcooked-single-no-adapt";
import OvercookedSinglePlayerTrainingTask from "./js/overcooked-single-training"
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
    MAIN_TRIAL_TIME: 2, //seconds
    TIMESTEP_LENGTH: 150, //milliseconds
    DELIVERY_POINTS: 5,
    POINT_VALUE: .01,
    BASE_PAY: 1.00,
    PLAYER_INDEX: 1,  // Either 0 or 1
    MODEL_TYPE: 'ppo_bc'  // Either ppo_bc, ppo_sp, or pbt
};
let worker_bonus = 0;
let is_leader;

/***********************************
      Main trial order
 ************************************/


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
                                the <b>arrow keys</b>, and interact with objects
                                using the <b>spacebar</b>.
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
                            and you must collaborate with them to play the game. For each layout, you will be paired with two different partners: Partner A
                            first, and Partner B second. For each layout, you will be asked to select your preferred partner. </p>
                            <br>
                            <p>Good luck! Click continue to proceed to the first practice round. </p>
                            </div>
                        `
                    });
                    setTimeout(() => {
                        $(".instructionsnav").show();
                    }, 150)
                }
            },

            // Training
            {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function() {
                    $(".instructionsnav").hide();
                    let npc_policy = (function() {
                        let a_seq = [
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
                        MAX_TIME : 2, //seconds
                        init_orders: ['onion'],
                        completion_callback: () => {
                            psiTurk.saveData();
                            setTimeout(() => {
                                $(".instructionsnav").show();
                            }, 1500);
                        },
                        timestep_callback: (data) => {
                            data.participant_id = participant_id;
                            data.layout_name = "training0";
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
                    psiTurk.recordUnstructuredData('PLAYER_INDEX', EXP.PLAYER_INDEX);
                    psiTurk.recordUnstructuredData('MODEL_TYPE', EXP.MODEL_TYPE);
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>Great job, you've completed Practice Round 1 with Partner X. 
                            Next, you will cook soups and bring them to your partner, Partner Z,
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
                        MAX_TIME : 2, //seconds
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
                            data.layout_name = "training2";
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
                    let survey = new PageBlockSurveyHandler({containername: "pageblock"});
                    survey.addone({
                        type: 'textdisplay',
                        questiontext: `
                            <div>
                            <h2>Instructions</h2>
                            <p>Great! Now you will be paired up with another
                            computer partner for a set of five harder layouts.</p>
                            </div>
                        `
                    });
                }
            }
        ];

        /*********
         Main task
         *********/
        var task_pages = _.map(_.range(main_trial_order.length), (round_num) => {
            var random_p = Math.random();
            var agent_order = ['ppo_bc', 'ppo_adapt'];
            if (random_p <= 0.5){
                var agent_order = ['ppo_adapt', 'ppo_bc'];
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
                            <p>In the next map, you will first play a round with <strong><mark>Partner A.</mark> </strong></p>
                            </div>
                        `
                    });
                }
            }

            let game_page_no_adapt = {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function () {
                    let layout_name = main_trial_order[round_num];
		    getOvercookedPolicy(agent_order[0], layout_name, AGENT_INDEX).then(function(npc_policy) {
                        $(".instructionsnav").hide();
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
                                <h3>Survey: Please evaluate your collaboration with Partner A.</h3>
                            `
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'fluency-A-'+ (round_num+1),
                            questiontext: 'Partner A and I worked fluently together.',
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
                            name: 'fluency_over_time-A-'+ (round_num+1),
                            questiontext: 'The team\'s fluency improved over time.',
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
                            name: 'equal_contribution-A-'+ (round_num+1),
                            questiontext: 'Partner A contributed equally to the team performance.',
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
                            name: 'unequal_contribution-A-'+ (round_num+1),
                            questiontext: 'I had to carry the weight to make the team better.',
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
                            name: 'subgoals-A-'+ (round_num+1),
                            questiontext: 'Partner A perceived accurately what tasks I was trying to accomplish.',
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

                    window.save_data();
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
                            <p>In the same map, you will next play a round with <strong><mark>Partner B.</mark> </strong>.</p>
                            </div>
                        `
                    });
                }
            }

            let game_page_adapt = {
                'pagename': 'exp/pageblock.html',
                'pagefunc': function () {
                    let layout_name = main_trial_order[round_num];
                        if (layout_name === "random0"){
                            getOvercookedPolicy(EXP.MODEL_TYPE, layout_name, AGENT_INDEX).then(function (npc_policy_1) {getOvercookedPolicy(EXP.MODEL_TYPE, layout_name+'_temp', AGENT_INDEX).then(function(npc_policy) {
                            $(".instructionsnav").hide();
                            let npc_policies = {};
                            npc_policies[AGENT_INDEX] = {0:npc_policy, 1:npc_policy_1};
                            let game = new OvercookedSinglePlayerTask({
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
                                            psiTurk.recordTrialData(data);
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
                        })});
                    }
                    else{
                        getOvercookedPolicy(EXP.MODEL_TYPE, layout_name, AGENT_INDEX).then(function(npc_policy) {
                            $(".instructionsnav").hide();
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
                                            data.agent_type = agent_order[1];
                                            psiTurk.recordTrialData(data);
                                            // console.log(data);
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
                                <h3>Survey: Please evaluate your collaboration with Partner B. </h3>
                            `
                        },
                        {
                            type: 'horizontal-radio',
                            name: 'fluency-B-'+ (round_num+1),
                            questiontext: 'Partner B and I worked fluently together.',
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
                            name: 'fluency_over_time-B-'+ (round_num+1),
                            questiontext: 'The team\'s fluency improved over time.',
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
                            name: 'equal_contribution-B-'+ (round_num+1),
                            questiontext: 'Partner B contributed equally to the team performance.',
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
                            name: 'unequal_contribution-B-'+ (round_num+1),
                            questiontext: 'I had to carry the weight to make the team better.',
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
                            name: 'subgoals-B-'+ (round_num+1),
                            questiontext: 'Partner B perceived accurately what tasks I was trying to accomplish.',
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

                    window.save_data();
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
                            options: [
                                {value: '1', optiontext: 'Partner A (First Round)'},
                                {value: '2', optiontext: 'Partner B (Second Round)'},
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
                            questiontext: 'The partner I selected contributed more than the other.',
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
                            questiontext: 'I collaborated more effectively with the partner I selected than the other.',
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
                            questiontext: 'My collaboration was more fluent with the partner I selected than the other.',
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

                    window.save_data();
                }
            },



        ]

            let output = [round_page, instruct1, game_page_no_adapt, post_game_1, instruct2, game_page_adapt, post_game_2, preference_survey];
            if (agent_order[0] === "ppo_adapt"){
                let output = [round_page, instruct1, game_page_adapt, post_game_1, instruct2, game_page_no_adapt, post_game_2, preference_survey];
            }
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
                            type: 'vertical-radio',
                            name: 'gender',
                            questiontext: 'Gender',
                            options: [
                                {value: '1', optiontext: 'Woman'},
                                {value: '2', optiontext: 'Man'},
                                {value: '3', optiontext: 'Transgender'},
                                {value: '4', optiontext: 'Non-binary/Non-conforming'},
                                {value: '5', optiontext: 'Prefer Not to Respond'},
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
                                <p>There was an error saving your data. 
                                Please check that you are connected to the internet.</p>

                                <p>
                                Click the button below to save manually (it may take a second)
                                </p>
                                <div>
                                <button type="button" class="btn btn-primary btn-lg" onclick="save_data();">
								  Save
								</button>
								</div>
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
                                $("#saving_msg").html("Success!");
                                console.log("Data sent");
                            }
                        });
                    };

                    window.save_data();

                    $("#pageblock").html(
                        `
                            <h2>Saving data</h2>
                            <div id="saving_msg">
                                <p>Please wait while we save your results so we can compute your bonus...</p>
                                <p>(This should take less than a minute).</p>
                                <p>This page should automatically continue.</p>
                            </div>
                        `
                    );
                }
            },

            "exp/complete.html"
        ]

        let exp_pages =
            _.flattenDeep([pre_task_pages, task_pages, post_task_pages])
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
