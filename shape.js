//これ以外に読み込みが必要なもの
//zip.min.js


async function f_all(a_url) {
	console.time("t1");
	const c_zoom_level = 16;
	const c_array = (await f_xhr_get(a_url, "arraybuffer")).response;
	const c_csv = f_zip_to_text(c_array);
	const c_file_names = ["agency", "agency_jp", "stops", "routes", "routes_jp", "trips", "office_jp", "stop_times", "calendar", "calendar_dates", "fare_attributes", "fare_rules", "shapes", "frequencies", "transfers", "feed_info", "translations"];
	const c_json = {};
	const a_data = c_json;
	for (let i1 = 0; i1 < c_file_names.length; i1++) {
		if (c_csv[c_file_names[i1] + ".txt"] !== undefined) {
			c_json[c_file_names[i1]] =  f_csv_to_json(c_csv[c_file_names[i1] + ".txt"]);
		}
	}
	f_number_gtfs(c_json);
	const c_tile_list = {};//必要なタイル
	f_lonlat_to_xy(c_tile_list, c_json, c_zoom_level);
	console.log(c_tile_list);
	//タイルマップを読み込む
	const c_tile = {};
	for (let i1 in c_tile_list) {
		const c_url = "https://cyberjapandata.gsi.go.jp/xyz/experimental_rdcl/16/" + String(c_tile_list[i1]["x_16"]) + "/" + c_tile_list[i1]["y_16"] + ".geojson";
		try {
			c_tile_list[i1]["geojson"] = JSON.parse((await f_xhr_get(c_url, "text")).responseText);
		} catch(e) {
			c_tile_list[i1]["geojson"] = {"features": []};
			console.log(c_url);
		}
	}
	console.timeEnd("t1");
	//点を集める
	//前後の点を入れる
	const c_points = {};
	console.time("t2");
	const c_ranks = {"3m未満": 2, "3m-5.5m未満": 1, "5.5m-13m未満": 0.5,"13m-19.5m未満": 0.5, "19.5m以上": 0.5};
	for (let i1 in c_tile_list) {
		const c_x_16 = c_tile_list[i1]["x_16"];
		const c_y_16 = c_tile_list[i1]["y_16"];
		const c_features = c_tile_list[i1]["geojson"]["features"];
		for (let i2 = 0; i2 < c_features.length; i2++) {
			const c_properties = c_features[i2]["properties"];
			if (c_properties["rnkWidth"] === "3m未満") {
				//continue;//うまくいかない（太い道が孤立？）
			}
			let l_rank = c_ranks[c_properties["rnkWidth"]];
			if (c_properties["type"] !== "通常部") {
				//continue;//歩道等は除く
				//うまく接続されない？
				if (l_rank !== "3m未満") {
					//l_rank = "3m-5.5m未満"; //通常部以外はrankを下げる、うまくいかない
				}
			}
			const c_rank = l_rank;
			const c_coordinates = c_features[i2]["geometry"]["coordinates"];
			//距離を求める
			//区切る長さ
			//緯度1度=111km→10mごとに区切る？なら10000分の1
			let l_min_distance = 3000 //単位は/度？
			if (c_properties["rnkWidth"] === "3m未満" || c_properties["rnkWidth"] === "3m-5.5m未満") {
				l_min_distance *= 2; //狭い道路を長く補正
			}
			const c_distances = []; //分割数（距離が長いと多い）
			for (let i3 = 0; i3 < c_coordinates.length - 1; i3++) {
				//緯度経度をそのまま用いて簡単に計算
				c_distances.push(Math.ceil((((c_coordinates[i3 + 1][0] - c_coordinates[i3][0]) ** 2 + (c_coordinates[i3 + 1][1] - c_coordinates[i3][1]) ** 2) ** 0.5) * l_min_distance));
				//c_distances.push(1);
			}
			//途中点を加え、前後の点をつなぐ
			for (let i3 = 0; i3 < c_coordinates.length; i3++) {
				const c_lon = c_coordinates[i3][0];
				const c_lat = c_coordinates[i3][1];
				const c_key = "lon_" + c_lon + "_lat_" + c_lat;
				if (c_points[c_key] === undefined) {//nextの上書き防止
					const c_x = f_lon_to_x(c_lon, c_zoom_level);
					const c_y = f_lat_to_y(c_lat, c_zoom_level);
					const c_x_18 = Math.floor(c_x / 64);
					const c_y_18 = Math.floor(c_y / 64);
					c_points[c_key] = {"x_16": c_x_16, "y_16": c_y_16, "lon": c_lon, "lat": c_lat, "x": c_x, "y": c_y, "x_18": c_x_18, "y_18": c_y_18, "next": {}, "rank": c_rank};
				}
				if (c_points[c_key]["rank"] > c_rank) {
					c_points[c_key]["rank"] = c_rank;
				}
				
				//前の点
				if (i3 !== 0) {
					//前のkey
					const c_pre_keys = [];
					const c_pre_point = "lon_" + c_coordinates[i3 - 1][0] + "_lat_" + c_coordinates[i3 - 1][1]; //最初の点
					c_pre_keys.push(c_pre_point); //最初の点
					for (let i4 = 1; i4 <= c_distances[i3 - 1]; i4++) {
						if (i4 === c_distances[i3 - 1]) { //最後
							c_pre_keys.push(c_key);
						} else { //最後以外、途中の追加点
							const c_lon_i4 = c_coordinates[i3][0] * i4 / c_distances[i3 - 1] + c_coordinates[i3 - 1][0] * (c_distances[i3 - 1] - i4) / c_distances[i3 - 1];
							const c_lat_i4 = c_coordinates[i3][1] * i4 / c_distances[i3 - 1] + c_coordinates[i3 - 1][1] * (c_distances[i3 - 1] - i4) / c_distances[i3 - 1];
							const c_key_i4 = "lon_" + c_lon_i4 + "_lat_" + c_lat_i4;
							if (c_points[c_key_i4] === undefined) {
								const c_x_i4 = f_lon_to_x(c_lon_i4, c_zoom_level);
								const c_y_i4 = f_lat_to_y(c_lat_i4, c_zoom_level);
								const c_x_18_i4 = Math.floor(c_x_i4 / 64);
								const c_y_18_i4 = Math.floor(c_y_i4 / 64);
								c_points[c_key_i4] = {"exist": false, "x_16": c_x_16, "y_16": c_y_16, "lon": c_lon_i4, "lat": c_lat_i4, "x": c_x_i4, "y": c_y_i4, "x_18": c_x_18_i4, "y_18": c_y_18_i4, "next": {}, "rank": c_rank};
							}
							c_pre_keys.push(c_key_i4);
						}
					}
					//c_key_2 c_pre_point
					//c_key_3 c_key_2
					//c_key c_key_3
					for (let i4 = 0; i4 < c_pre_keys.length - 1; i4++) {
						c_points[c_pre_keys[i4 + 1]]["next"][c_pre_keys[i4]] = c_pre_keys[i4];
					}
				}
				//後の点
				if (i3 !== c_coordinates.length - 1) {
					const c_post_keys = [];
					const c_post_point = "lon_" + c_coordinates[i3 + 1][0] + "_lat_" + c_coordinates[i3 + 1][1]; //最初の点
					c_post_keys.push(c_post_point); //最初の点
					for (let i4 = 1; i4 <= c_distances[i3]; i4++) {
						if (i4 === c_distances[i3]) { //最後
							c_post_keys.push(c_key);
						} else { //最後以外、途中の追加点
							const c_lon_i4 = c_coordinates[i3][0] * i4 / c_distances[i3] + c_coordinates[i3 + 1][0] * (c_distances[i3] - i4) / c_distances[i3];
							const c_lat_i4 = c_coordinates[i3][1] * i4 / c_distances[i3] + c_coordinates[i3 + 1][1] * (c_distances[i3] - i4) / c_distances[i3];
							const c_key_i4 = "lon_" + c_lon_i4 + "_lat_" + c_lat_i4;
							if (c_points[c_key_i4] === undefined) {
								const c_x_i4 = f_lon_to_x(c_lon_i4, c_zoom_level);
								const c_y_i4 = f_lat_to_y(c_lat_i4, c_zoom_level);
								const c_x_18_i4 = Math.floor(c_x_i4 / 64);
								const c_y_18_i4 = Math.floor(c_y_i4 / 64);
								c_points[c_key_i4] = {"exist": false, "x_16": c_x_16, "y_16": c_y_16, "lon": c_lon_i4, "lat": c_lat_i4, "x": c_x_i4, "y": c_y_i4, "x_18": c_x_18_i4, "y_18": c_y_18_i4, "next": {}, "rank": c_rank};
							}
							c_post_keys.push(c_key_i4);
						}
					}
					for (let i4 = 0; i4 < c_post_keys.length - 1; i4++) {
						c_points[c_post_keys[i4 + 1]]["next"][c_post_keys[i4]] = c_post_keys[i4];
					}
				}
				
				
			}
		}
	}
	console.timeEnd("t2");


	//端を探す
	const c_xy = {"top_24": Number.MAX_SAFE_INTEGER, "bottom_24": 0, "left_24": Number.MAX_SAFE_INTEGER, "right_24": 0};
	for (let i1 = 0; i1 < a_data["stops"].length; i1++) {
		if (a_data["stops"][i1]["stop_x"] < c_xy["left_24"]) {
			c_xy["left_24"] = a_data["stops"][i1]["stop_x"];
		}
		if (a_data["stops"][i1]["stop_x"] > c_xy["right_24"]) {
			c_xy["right_24"] = a_data["stops"][i1]["stop_x"];
		}
		if (a_data["stops"][i1]["stop_y"] < c_xy["top_24"]) {
			c_xy["top_24"] = a_data["stops"][i1]["stop_y"];
		}
		if (a_data["stops"][i1]["stop_y"] > c_xy["bottom_24"]) {
			c_xy["bottom_24"] = a_data["stops"][i1]["stop_y"];
		}
	}
	c_xy["left_16"] = Math.floor(c_xy["left_24"] / 256) - 1;
	c_xy["right_16"] = Math.ceil(c_xy["right_24"] / 256) + 1;
	c_xy["top_16"] = Math.floor(c_xy["top_24"] / 256) - 1;
	c_xy["bottom_16"] = Math.ceil(c_xy["bottom_24"] / 256) + 1;
	c_xy["width_16"] = c_xy["right_16"] - c_xy["left_16"] + 1;
	c_xy["height_16"] = c_xy["bottom_16"] - c_xy["top_16"] + 1;
	c_xy["left_24"] = c_xy["left_16"] * 256;
	c_xy["right_24"] = c_xy["right_16"] * 256;
	c_xy["top_24"] = c_xy["top_16"] * 256;
	c_xy["bottom_24"] = c_xy["bottom_16"] * 256;
	c_xy["width_24"] = c_xy["width_16"] * 256;
	c_xy["height_24"] = c_xy["height_16"] * 256;
	if ((c_xy["right_16"] - c_xy["right_16"]) * (c_xy["top_16"] - c_xy["bottom_16"]) > 64) {
		console.log("64より大きい");
	}
	console.log(c_xy);


	//目次を作る
	const c_index = {};
	for (let i1 in c_points) {
		if (c_index["x_" + String(c_points[i1]["x_16"]) + "_y_" + String(c_points[i1]["y_16"])] === undefined) {
			c_index["x_" + String(c_points[i1]["x_16"]) + "_y_" + String(c_points[i1]["y_16"])] = {};
		}
		c_index["x_" + String(c_points[i1]["x_16"]) + "_y_" + String(c_points[i1]["y_16"])][i1] = c_points[i1];
	}
	//目次を作る
	const c_index_18 = {};
	for (let i1 in c_points) {
		if (c_index_18["x_" + String(c_points[i1]["x_18"]) + "_y_" + String(c_points[i1]["y_18"])] === undefined) {
			c_index_18["x_" + String(c_points[i1]["x_18"]) + "_y_" + String(c_points[i1]["y_18"])] = {};
		}
		c_index_18["x_" + String(c_points[i1]["x_18"]) + "_y_" + String(c_points[i1]["y_18"])][i1] = c_points[i1];
	}


	console.time("t5");
	for (let i1 = 0; i1 < a_data["stops"].length; i1++) {
		const c_stop = a_data["stops"][i1];
		let l_nearest_point = null;
		let l_distance_min = Number.MAX_SAFE_INTEGER;
		for (let i2 = 0; i2 < 3; i2++) {
			for (let i3 = 0; i3 < 3; i3++) {
				for (let i4 in c_index_18["x_" + String(c_stop["x_18"] - 1 + i2) + "_y_" + String(c_stop["y_18"] - 1 + i3)]) {
					//const c_distance = (Math.abs(c_points[i4]["x"] - c_stop["stop_x"]) + Math.abs(c_points[i4]["y"] - c_stop["stop_y"])) * c_points[i4]["rank"];
					const c_distance = (((c_points[i4]["x"] - c_stop["stop_x"]) ** 2 + (c_points[i4]["y"] - c_stop["stop_y"]) ** 2) ** 0.5) * c_points[i4]["rank"];
					if (c_distance < l_distance_min) {
						l_nearest_point = i4;
						l_distance_min = c_distance;
					}
				}
			}
		}
		c_stop["nearest_point"] = l_nearest_point;
	}
	console.timeEnd("t5");


	console.log(c_index);
	console.time("t5_2");
	for (let i1 = 0; i1 < a_data["shapes"].length; i1++) {
		const c_shape = a_data["shapes"][i1];
		let l_nearest_point = null;
		let l_distance_min = Number.MAX_SAFE_INTEGER;
		for (let i2 = 0; i2 < 3; i2++) {
			for (let i3 = 0; i3 < 3; i3++) {
				for (let i4 in c_index_18["x_" + String(c_shape["x_18"] - 1 + i2) + "_y_" + String(c_shape["y_18"] - 1 + i3)]) {
					//const c_distance = (Math.abs(c_points[i4]["x"] - c_shape["shape_pt_x"]) + Math.abs(c_points[i4]["y"] - c_shape["shape_pt_y"])) * c_points[i4]["rank"];
					const c_distance = (((c_points[i4]["x"] - c_shape["shape_pt_x"]) ** 2 + (c_points[i4]["y"] - c_shape["shape_pt_y"]) ** 2) ** 0.5) * c_points[i4]["rank"];
					if (c_distance < l_distance_min) {
						l_nearest_point = i4;
						l_distance_min = c_distance;
					}
				}
			}
		}
		c_shape["nearest_point"] = l_nearest_point;
	}
	console.timeEnd("t5_2");


	const c_stop_array = [];
	/*
	for (let i1 = 0; i1 < a_data["stop_times"].length; i1++) {
		if (i1 > 0) {
			if (a_data["stop_times"][i1 - 1]["stop_sequence"] > a_data["stop_times"][i1]["stop_sequence"]) {
				break;
			}
		}
		c_stop_array.push({"stop_id": a_data["stop_times"][i1]["stop_id"]});
	}
	for (let i1 = 0; i1 < c_stop_array.length; i1++) {
		for (let i2 = 0; i2 < a_data["stops"].length; i2++) {
			if (a_data["stops"][i2]["stop_id"] === c_stop_array[i1]["stop_id"]) {
				c_stop_array[i1]["nearest_point"] = a_data["stops"][i2]["nearest_point"];
			}
		}
	}
	*/
	for (i1 = 0; i1 < a_data["shapes"].length; i1++) {
		if (i1 !== 0) {
			if (a_data["shapes"][i1 - 1]["shape_id"] !== a_data["shapes"][i1]["shape_id"]) {
				break;
			}
		}
		c_stop_array.push({"nearest_point": a_data["shapes"][i1]["nearest_point"]});
	}

	
	const c_old_shapes = [];
	for (i1 = 0; i1 < a_data["shapes"].length; i1++) {
		if (i1 === 0) {
			c_old_shapes.push([]);
		} else {
			if (a_data["shapes"][i1 - 1]["shape_id"] !== a_data["shapes"][i1]["shape_id"]) {
				c_old_shapes.push([]);
			}
		}
		c_old_shapes[c_old_shapes.length - 1].push({"nearest_point": a_data["shapes"][i1]["nearest_point"], "x": a_data["shapes"][i1]["shape_pt_x"], "y": a_data["shapes"][i1]["shape_pt_y"]});
	}
	const c_shape_ids = [];
	for (i1 = 0; i1 < a_data["shapes"].length; i1++) {
		if (i1 === 0) {
			c_shape_ids.push(a_data["shapes"][i1]["shape_id"]);
		} else {
			if (a_data["shapes"][i1 - 1]["shape_id"] !== a_data["shapes"][i1]["shape_id"]) {
				c_shape_ids.push(a_data["shapes"][i1]["shape_id"]);
			}
		}
	}


	//経路検索
	console.time("t6");
	const c_new_shapes = [];
	for (let i1 = 0; i1 < c_old_shapes.length; i1++) {
		c_new_shapes[i1] = [];
		for (let i2 = 0; i2 < c_old_shapes[i1].length - 1; i2++) {
			const c_add = f_1(c_points, c_old_shapes[i1][i2]["nearest_point"], c_old_shapes[i1][i2 + 1]["nearest_point"]);
			for (let i3 = c_add.length - 1; i3 >= 0; i3--) {
				if (i2 !== 0 && i3 === 0) {
					continue;
				}
				if (c_points[c_add[i3]] === undefined) {
					continue;
				}
				if (c_points[c_add[i3]]["exist"] === false) {
					continue;
				}
				c_new_shapes[i1].push(c_add[i3]);
			}
		}
	}
	console.timeEnd("t6");


	//経路検索
	/*
	console.time("t6");
	let l_r = [];
	for (let i1 = 0; i1 < c_stop_array.length - 1; i1++) {
		const c_add = f_1(c_points, c_stop_array[i1]["nearest_point"], c_stop_array[i1 + 1]["nearest_point"]);
		for (let i2 = c_add.length - 1; i2 >= 0; i2--) {
			if (i1 !== 0 && i2 === 0) {
				continue;
			}
			l_r.push(c_add[i2]);
		}
	}
	console.log(l_r);
	console.timeEnd("t6");
	*/

	let l_line_svg;

	//オリジナル
	for (i1 = 0; i1 < c_old_shapes.length; i1++) {
		l_line_svg += "<path style=\"fill: none; stroke: #000000; stroke-width: 1px;\" d=\"";
		for (i2 = 0; i2 < c_old_shapes[i1].length; i2++) {
			if (i2 === 0) {
				l_line_svg += "M ";
			} else {
				l_line_svg += " L ";
			}
			l_line_svg += String(c_old_shapes[i1][i2]["x"] - c_xy["left_24"]) + "," + String(c_old_shapes[i1][i2]["y"] - c_xy["top_24"]);
		}
		l_line_svg += "\" />"
	}

	//中心線
	for (i1 = 0; i1 < c_new_shapes.length; i1++) {
		l_line_svg += "<path style=\"fill: none; stroke: #ff0000; stroke-width: 1px;\" d=\"";
		for (i2 = 0; i2 < c_new_shapes[i1].length; i2++) {
			if (i2 === 0) {
				l_line_svg += "M ";
			} else {
				l_line_svg += " L ";
			}
			l_line_svg += String(c_points[c_new_shapes[i1][i2]]["x"] - c_xy["left_24"]) + "," + String(c_points[c_new_shapes[i1][i2]]["y"] - c_xy["top_24"]);
		}
		l_line_svg += "\" />"
	}

	//対応線
	let l_on_line;
	for (i1 = 0; i1 < c_old_shapes.length; i1++) {
		for (i2 = 0; i2 < c_old_shapes[i1].length; i2++) {
			const c_np = c_old_shapes[i1][i2]["nearest_point"];
			const c_np_x = c_points[c_np]["x"];
			const c_np_y = c_points[c_np]["y"];
			l_line_svg += "<path style=\"fill: none; stroke: #00FF00; stroke-width: 1px;\" d=\"M ";
			l_line_svg += String(c_np_x - c_xy["left_24"]) + "," + String(c_np_y - c_xy["top_24"]);
			l_line_svg += " L " + String(c_old_shapes[i1][i2]["x"] - c_xy["left_24"]) + "," + String(c_old_shapes[i1][i2]["y"] - c_xy["top_24"]);
			l_line_svg += "\" />";
		}
	}

	//点
	let l_circle = "";
	for (i1 = 0; i1 < c_new_shapes.length; i1++) {
		for (i2 = 0; i2 < c_new_shapes[i1].length; i2++) {
			l_circle += "<circle style=\"fill: none; stroke: #ff00ff; stroke-width: 1px;\" r=\"2\" cx=\"" + String(c_points[c_new_shapes[i1][i2]]["x"] - c_xy["left_24"]) + "\" cy=\"" + String(c_points[c_new_shapes[i1][i2]]["y"] - c_xy["top_24"]) + "\" />";
		}
	}
	//点
	for (i1 = 0; i1 < c_old_shapes.length; i1++) {
		for (i2 = 0; i2 < c_old_shapes[i1].length; i2++) {
			l_circle += "<circle style=\"fill: none; stroke: #00ffff; stroke-width: 1px;\" r=\"3\" cx=\"" + String(c_old_shapes[i1][i2]["x"] - c_xy["left_24"]) + "\" cy=\"" + String(c_old_shapes[i1][i2]["y"] - c_xy["top_24"]) + "\" />";
		}
	}


/*
	//オリジナル
	l_line_svg += "<path style=\"fill: none; stroke: #000000; stroke-width: 1px;\" d=\"";
	for (i1 = 0; i1 < a_data["shapes"].length; i1++) {
		if (i1 === 0) {
			l_line_svg += "M ";
		} else {
			if (a_data["shapes"][i1 - 1]["shape_id"] !== a_data["shapes"][i1]["shape_id"]) {
				break;
			}
			l_line_svg += " L ";
		}
		l_line_svg += String(a_data["shapes"][i1]["shape_pt_x"] - c_xy["left_24"]) + "," + String(a_data["shapes"][i1]["shape_pt_y"] - c_xy["top_24"]);
	}
	l_line_svg += "\" />"
	
	//中心線
	l_line_svg += "<path style=\"fill: none; stroke: #ff0000; stroke-width: 1px;\" d=\"";
	for (i1 = 0; i1 < l_r.length; i1++) {
		if (i1 === 0) {
			l_line_svg += "M ";
		} else {
			l_line_svg += " L ";
		}
		l_line_svg += String(c_points[l_r[i1]]["x"] - c_xy["left_24"]) + "," + String(c_points[l_r[i1]]["y"] - c_xy["top_24"]);
	}
	l_line_svg += "\" />"
*/



	let l_svg = "<svg width=\"" + c_xy["width_24"] + "\" height=\"" + c_xy["height_24"] + "\" viewBox=\"0 0 " + c_xy["width_24"] + " " + c_xy["height_24"] + "\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\"><g transform=\"translate(" + /*String(-1 * c_xy["left_24"]) + "," + String(-1 * c_xy["top_24"]) +*/ ")\">" + l_line_svg + l_circle + "</g></svg>";



	//CSV作成
	let l_csv_shapes = "";
	l_csv_shapes += "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence";
	for (let i1 = 0; i1 < c_new_shapes.length; i1++) {
		for (let i2 = 0; i2 < c_new_shapes[i1].length; i2++) {
			const c_lat = c_points[c_new_shapes[i1][i2]]["lat"];
			const c_lon = c_points[c_new_shapes[i1][i2]]["lon"];
			l_csv_shapes += "\n" + c_shape_ids[i1] + "," + c_lat + "," + c_lon + "," + String(i2);
		}
	}
	l_svg += "<pre>" + l_csv_shapes + "</pre>";

	console.log(c_json);
	console.log(c_points);

	return l_svg;
}



//XHR
function f_xhr_get(a_url, a_type) {
	function f_promise(a_resolve, a_reject) {
		const c_xhr = new XMLHttpRequest();
		c_xhr.responseType = a_type;//"arraybuffer";
		c_xhr.open("get", a_url);
		function f_resolve() {
			a_resolve(c_xhr);
		}
		function f_reject() {
			a_reject("error");
		}
		c_xhr.onload = f_resolve;
		c_xhr.onerror = f_reject;
		c_xhr.send(null);
	}
	return new Promise(f_promise);
}

//ZIPの解凍
Uin32Array = Uint32Array;//これがないとzip.min.js（jsinflate.js）がエラーになる
function f_zip_to_text(a_array) {
	const c_byte = new Uint8Array(a_array);
	const c_unzip = new Zlib.Unzip(c_byte);
	const c_filenames = c_unzip.getFilenames();
	const c_plain = c_unzip.decompress(c_filenames[0]);
	const c_files = {};
	for (let i1 = 0; i1 < c_filenames.length; i1++) {
		c_files[c_filenames[i1]] = new TextDecoder("utf-8").decode(Uint8Array.from(c_unzip.decompress(c_filenames[i1])).buffer);
	}
	return c_files;
}


function f_csv_to_json(a_csv) {
	//CSVを2次元配列にする。
	let l_1 = 0;
	let l_2 = 0;
	const c_array = [[]];
	a_csv.replace(/\r?\n$/, "").replace(new RegExp(',|\r?\n|[^,"\r\n][^,\r\n]*|"(?:[^"]|"")*"', "g"), function(a1) {
		if (a1 === ",") {
			l_2 += 1;
			c_array[l_1][l_2] = "";
		} else if (a1 === "\n" || a1 === "\r\n") {
			l_1 += 1;
			c_array[l_1] = [];
			l_2 = 0;
		} else if (a1.charAt(0) !== "\"") {
			c_array[l_1][l_2] = a1;
		} else {
			c_array[l_1][l_2] = a1.slice(1, -1).replace(/""/g, "\"");
		}
	});
	//二次元配列をJSONに変換する。
	const c_json = [];
	for (let i1 = 1; i1 < c_array.length; i1++) {
		c_json.push({});
		for (let i2 = 0; i2 < c_array[i1].length; i2++) {
			c_json[i1 - 1][c_array[0][i2]] = c_array[i1][i2].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
		}
	}
	//この段階では全てテキストになっている。
	return c_json;
}



//緯度、経度、順番の文字列を数値に変換する。
function f_number_gtfs(a_data) {
	for (let i1 = 0; i1 < a_data["stops"].length; i1++) {
		a_data["stops"][i1]["stop_lat"] = Number(a_data["stops"][i1]["stop_lat"]);
		a_data["stops"][i1]["stop_lon"] = Number(a_data["stops"][i1]["stop_lon"]);
	}
	for (let i1 = 0; i1 < a_data["stop_times"].length; i1++) {
		a_data["stop_times"][i1]["stop_sequence"] = Number(a_data["stop_times"][i1]["stop_sequence"]);
	}
	for (let i1 = 0; i1 < a_data["shapes"].length; i1++) {
		a_data["shapes"][i1]["shape_pt_lat"] = Number(a_data["shapes"][i1]["shape_pt_lat"]);
		a_data["shapes"][i1]["shape_pt_lon"] = Number(a_data["shapes"][i1]["shape_pt_lon"]);
		a_data["shapes"][i1]["shape_pt_sequence"] = Number(a_data["shapes"][i1]["shape_pt_sequence"]);
	}
}

function f_lonlat_to_xy(a_tile_list, a_data, a_zoom_level) {
	for (let i1 = 0; i1 < a_data["stops"].length; i1++) {
		const c_stop = a_data["stops"][i1];
		c_stop["stop_x"] = f_lon_to_x(c_stop["stop_lon"], a_zoom_level);
		c_stop["stop_y"] = f_lat_to_y(c_stop["stop_lat"], a_zoom_level);
		c_stop["x_16"] = Math.floor(c_stop["stop_x"] / 256);
		c_stop["y_16"] = Math.floor(c_stop["stop_y"] / 256);
		c_stop["x_18"] = Math.floor(c_stop["stop_x"] / 64);
		c_stop["y_18"] = Math.floor(c_stop["stop_y"] / 64);
		a_tile_list["x_" + String(c_stop["x_16"]) + "_y_" + String(c_stop["y_16"])] = {"x_16": c_stop["x_16"], "y_16": c_stop["y_16"]};
	}
	for (let i1 = 0; i1 < a_data["shapes"].length; i1++) {
		const c_shape = a_data["shapes"][i1];
		c_shape["shape_pt_x"] = f_lon_to_x(c_shape["shape_pt_lon"], a_zoom_level);
		c_shape["shape_pt_y"] = f_lat_to_y(c_shape["shape_pt_lat"], a_zoom_level);
		c_shape["x_16"] = Math.floor(c_shape["shape_pt_x"] / 256);
		c_shape["y_16"] = Math.floor(c_shape["shape_pt_y"] / 256);
		c_shape["x_18"] = Math.floor(c_shape["shape_pt_x"] / 64);
		c_shape["y_18"] = Math.floor(c_shape["shape_pt_y"] / 64);
		a_tile_list["x_" + String(c_shape["x_16"]) + "_y_" + String(c_shape["y_16"])] = {"x_16": c_shape["x_16"], "y_16": c_shape["y_16"]};
	}
	for (let i1 in a_tile_list) {
		const c_x_16 = a_tile_list[i1]["x_16"];
		const c_y_16 = a_tile_list[i1]["y_16"];
		for (let i2 = 0; i2 < 3; i2++) {
			for (let i3 = 0; i3 < 3; i3++) {
				a_tile_list["x_" + String(c_x_16 - 1 + i2) + "_y_" + String(c_y_16 - 1 + i3)] = {"x_16": c_x_16 - 1 + i2, "y_16": c_y_16 - 1 + i3};
			}
		}
	}
}






function f_lon_to_x(a_lon, a_zoom_level) {
	const c_dx = 0;//左端
	const c_x = 2 ** (a_zoom_level + 7) * (a_lon / 180 + 1) - c_dx;
	return c_x;
}

function f_lat_to_y(a_lat, a_zoom_level) {
	const c_dy = 0;//上端
	const c_y = 2 ** (a_zoom_level + 7) / Math.PI * ((-1) * Math.atanh(Math.sin(a_lat * Math.PI / 180)) + Math.atanh(Math.sin(85.05112878 * Math.PI / 180))) - c_dy;
	return c_y;
}



//うまくいかない？
function f_x_to_lon(a_x, a_zoom_level) {
	const c_lon = 180 * (a_x * 256 / (2 ** (a_zoom_level + 7)) - 1);
	return c_lon;
}

function f_y_to_lat(a_y, a_zoom_level) {
	const c_lat = (180 / Math.PI) * (Math.asin(Math.tanh((-1) * (Math.PI / (2 ** (a_zoom_level + 7))) * a_y * 256 + Math.atanh(Math.sin(85.05112878 * Math.PI / 180)))));
	return c_lat;
}







function f_1(a_points, a_start, a_end) {
	const c_index_distance = [];//距離の記録
	const c_previous_point = {};//前の点の記録
	//幅優先探索？
	//最初の距離を0にする
	c_index_distance[0] = {};
	c_index_distance[0][a_start] = {};
	c_previous_point[a_start] = "start";
	f_search(c_index_distance, c_previous_point, a_points, 0, a_end);
	const c_list = [];
	let l_count = 0; 
	f_add(c_previous_point, a_end, c_list, l_count);
	return c_list;
}


//距離ごとのindexで高速化

function f_search(a_index_distance, a_previous_point, a_points, a1, a_end) {
	//距離a1の点から、次の距離a1+1の点を探す
	a_index_distance[a1 + 1] = {};
	let l_exist = false;
	for (let i1 in a_index_distance[a1]) {
		for (let i2 in a_points[i1]["next"]) {
			if (a_previous_point[i2] === undefined) {
				l_exist = true;
				a_previous_point[i2] = i1;
				a_index_distance[a1 + 1][i2] = {};
			}
			if (i2 === a_end) {
				return;
			}
		}
	}
	if (l_exist === false) {
		console.log(a_points);
		console.log("ない");
		return;
	}
	if (a1 > 200) {//無限ループ防止のため制限
		console.log(a_points);
		console.log("200回");
		return;
	}
	f_search(a_index_distance, a_previous_point, a_points, a1 + 1, a_end);
}

//aまでの点を加える
function f_add(a_previous_point, a_key, a_list, a_count) {
	if (a_key === "start") {
		return;
	}
	if (a_count > 200) {
		console.log(a_key + "繰り返し200回");
		return;
	}
	a_list.push(a_key);
	f_add(a_previous_point, a_previous_point[a_key], a_list, a_count + 1);
}







