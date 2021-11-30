import * as Overcooked from "overcooked"
let OvercookedGame = Overcooked.OvercookedGame.OvercookedGame;
let OvercookedMDP = Overcooked.OvercookedMDP;
let Direction = OvercookedMDP.Direction;
let Action = OvercookedMDP.Action;
let [NORTH, SOUTH, EAST, WEST] = Direction.CARDINAL;
let [STAY, INTERACT] = [Direction.STAY, Action.INTERACT];

export default class OvercookedSinglePlayerTask{
    constructor ({
        container_id,
	player_index,
        npc_policies,
        start_grid = [
                'XXXXXPXX',
                'O     2O',
                'T1     T',
                'XXXDPSXX'
            ],
        TIMESTEP = 200,
        MAX_TIME = 2, //seconds
        init_orders=['onion'],
        always_serve='onion',
        completion_callback = () => {console.log("Time up")},
        timestep_callback = (data) => {},
        DELIVERY_REWARD = 5
    }) {
        //NPC policies get called at every time step
        if (typeof(npc_policies) === 'undefined') {
            npc_policies = {
                1:
                    (function () {
                        let action_loop = [
                            SOUTH, WEST, NORTH, EAST
                        ];
                        let ai = 0;
                        let pause = 4;
                        return (s) => {
                            let a = STAY;
                            if (ai % pause === 0) {
                                a = action_loop[ai/pause];
                            }
                            ai += 1;
                            ai = ai % (pause*action_loop.length);
                            return a
                        }
                    })()
            }
        }
        this.npc_policies = npc_policies;
	this.player_index = player_index;
	this.most_likely_model_idx = 0;

	this.weight_assignment = [0.5, 0.5];
	this.human_history = [];
	this.robot_predicted_human_history_proba_0 = [];
	this.robot_predicted_human_history_proba_1 = [];

	this.robot_true_human_history_proba_0 = [];
	this.robot_true_human_history_proba_1 = [];



	let player_colors = {};
	player_colors[this.player_index] = 'green';
	player_colors[1 - this.player_index] = 'blue';

        this.game = new OvercookedGame({
            start_grid,
            container_id,
            assets_loc: "/static/assets/",
            ANIMATION_DURATION: TIMESTEP*.9,
            tileSize: 80,
            COOK_TIME: 20,
            explosion_time: Number.MAX_SAFE_INTEGER,
            DELIVERY_REWARD: DELIVERY_REWARD,
            always_serve: always_serve,
            player_colors: player_colors
        });
        this.init_orders = init_orders;
        console.log("Single player");

        this.TIMESTEP = TIMESTEP;
        this.MAX_TIME = MAX_TIME;
        this.time_left = MAX_TIME;
        this.cur_gameloop = 0;
        this.score = 0;
        this.completion_callback = completion_callback;
        this.timestep_callback = timestep_callback;
    }

    init() {
        this.game.init();

        this.start_time = new Date().getTime();
        this.state = this.game.mdp.get_start_state(this.init_orders);
        this.game.drawState(this.state);
        this.joint_action = [STAY, STAY];

        this.gameloop = setInterval(() => {
	    for (let npc_index in this.npc_policies) {
            let npc_a_0_proba = this.npc_policies[npc_index][0](this.state, this.game);
            let npc_a_1_proba = this.npc_policies[npc_index][1](this.state, this.game);

            var npc_a_0 = Action.INDEX_TO_ACTION[argmax(npc_a_0_proba)];
            var npc_a_1 = Action.INDEX_TO_ACTION[argmax(npc_a_1_proba)];

            var weighted_action_probs = [];
            for (var idx = 0; idx < npc_a_0_proba.length; idx++) {
                var r0_action_prob = npc_a_0_proba[idx];
                var r1_action_prob = npc_a_1_proba[idx];

                var weighted_proba = (r0_action_prob * this.weight_assignment[0]) + (r1_action_prob * this.weight_assignment[1]);
                weighted_action_probs.push(weighted_proba);
                console.log("r0_action_prob = "+ r0_action_prob);
                console.log("r1_action_prob = "+ r1_action_prob);
                console.log("weighted_proba = "+ weighted_proba);
            }

            var final_max_action = Action.INDEX_TO_ACTION[argmax(weighted_action_probs)];
            console.log("model weights probs = "+ this.weight_assignment[0] + " , "+ this.weight_assignment[1]);
            console.log("action weights probs = "+ weighted_action_probs);
            // console.log("action init: "+  action)
            console.log("final_max_action: "+  final_max_action)

            this.joint_action[npc_index] = final_max_action;


	    }
            let  [[next_state, prob], reward] =
                this.game.mdp.get_transition_states_and_probs({
                    state: this.state,
                    joint_action: this.joint_action
                });

            //update next round
            this.game.drawState(next_state);
            this.score += reward;
            this.game.drawScore(this.score);
            let time_elapsed = (new Date().getTime() - this.start_time)/1000;
            this.time_left = Math.round(this.MAX_TIME - time_elapsed);
            this.game.drawTimeLeft(this.time_left);

            //record data
            this.timestep_callback({
                state: this.state,
                joint_action: this.joint_action,
                next_state: next_state,
                reward: reward,
                time_left: this.time_left,
                score: this.score,
                time_elapsed: time_elapsed,
                cur_gameloop: this.cur_gameloop,
                client_id: undefined,
                is_leader: undefined,
                partner_id: undefined,
                datetime: +new Date()
            });

            //set up next timestep
            this.state = next_state;
            this.joint_action = [STAY, STAY];
            this.cur_gameloop += 1;
            this.activate_response_listener();

            //time run out
            if (this.time_left < 0) {
                this.time_left = 0;
                this.close();
            }
        }, this.TIMESTEP);
        this.activate_response_listener();
    }

    close () {
        if (typeof(this.gameloop) !== 'undefined') {
            clearInterval(this.gameloop);
        }
        this.game.close();
        this.disable_response_listener();
        this.completion_callback();
    }

    activate_response_listener () {
        $(document).on("keydown", (e) => {
            let action;
            switch(e.which) {
                case 37: // left
                action = WEST;
                break;

                case 38: // up
                action = NORTH;
                break;

                case 39: // right
                action = EAST;
                break;

                case 40: // down
                action = SOUTH;
                break;

                case 32: //space
                action = INTERACT;
                break;

                default: return; // exit this handler for other keys
            }
            e.preventDefault(); // prevent the default action (scroll / move caret)


            for (let npc_index in this.npc_policies) {
                let npc_a_0_h_proba = this.npc_policies[npc_index][0](this.state, this.game);
                let npc_a_1_h_proba = this.npc_policies[npc_index][1](this.state, this.game);

                let npc_a_0_h_max_prob = max(npc_a_0_h_proba);
                let npc_a_1_h_max_prob = max(npc_a_1_h_proba);
                var gamma = 0.9;
                var max_history_length = 5;
                var h_action_idx = Action.ACTION_TO_INDEX[action]

                if (this.human_history.length === max_history_length){
                    this.human_history.shift();
                    this.robot_predicted_human_history_proba_0.shift();
                    this.robot_predicted_human_history_proba_1.shift();
                    this.human_history.push(action);

                    this.robot_true_human_history_proba_0.push(npc_a_0_h_proba[h_action_idx]);
                    this.robot_true_human_history_proba_1.push(npc_a_1_h_proba[h_action_idx]);

                    this.robot_predicted_human_history_proba_0.push(npc_a_0_h_max_prob);
                    this.robot_predicted_human_history_proba_1.push(npc_a_1_h_max_prob);
                }

                var robot_1_g = 0;
                var robot_0_g = 0;
                for (var idx = 0; idx < this.human_history.length; idx++) {
                    var past_human_action_idx = this.human_history[idx];
                    var r0_prob_human_action_TRUE = this.robot_true_human_history_proba_0[idx];
                    var r1_prob_human_action_TRUE = this.robot_true_human_history_proba_1[idx];

                    var r0_prob_human_action_PRED = this.robot_predicted_human_history_proba_0[idx];
                    var r1_prob_human_action_PRED = this.robot_predicted_human_history_proba_1[idx];

                    robot_0_g = robot_0_g + ((gamma * (max_history_length - idx)) * Math.abs(r0_prob_human_action_PRED-r0_prob_human_action_TRUE));
                    robot_1_g = robot_1_g + ((gamma * (max_history_length - idx)) * Math.abs(r1_prob_human_action_PRED-r1_prob_human_action_TRUE));
                }
                if (robot_0_g+ robot_1_g === 0){
                    robot_0_g = 0.5;
                    robot_1_g = 0.5;
                }
                else{
                    robot_0_g = robot_0_g/(robot_0_g+ robot_1_g);
                    robot_1_g = robot_1_g/(robot_0_g+ robot_1_g);

                    robot_0_g = 1-robot_0_g;
                    robot_1_g = 1-robot_1_g;
                    if (robot_0_g+ robot_1_g === 0){
                        robot_0_g = 0.5;
                        robot_1_g = 0.5;
                    }
                    else{
                        robot_0_g = robot_0_g/(robot_0_g+ robot_1_g);
                        robot_1_g = robot_1_g/(robot_0_g+ robot_1_g);
                    }

                }
                this.weight_assignment = [robot_0_g, robot_1_g];

                console.log("weight assignment: "+ this.weight_assignment)



                // if (npc_a_0_h === action){
                //     this.most_likely_model_idx = 0;
                //     console.log("Most Likely Model Index = "+ this.most_likely_model_idx);
                //
                // }
                // if (npc_a_1_h === action){
                //     this.most_likely_model_idx = 1;
                //     console.log("Most Likely Model Index = "+ this.most_likely_model_idx);
                // }

            }


            this.joint_action[this.player_index] = action;
            this.disable_response_listener();
        });
    }

    disable_response_listener () {
        $(document).off('keydown');
    }
}

function max(array) {
    let bestIndex = 0;
    let bestValue = array[bestIndex];
    for (let i = 1; i < array.length; i++) {
	if (array[i] > bestValue) {
	    bestIndex = i;
	    bestValue = array[i];
	}
    }
    return bestValue;
}

function argmax(array) {
    let bestIndex = 0;
    let bestValue = array[bestIndex];
    for (let i = 1; i < array.length; i++) {
	if (array[i] > bestValue) {
	    bestIndex = i;
	    bestValue = array[i];
	}
    }
    return bestIndex;
}
