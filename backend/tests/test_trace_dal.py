from backend.dal.trace_dal import _build_tree


def test_build_tree_breaks_cycles():
    rows = [
        {
            "material_id": "MAT-1",
            "batch_id": "B1",
            "parent_material_id": None,
            "parent_batch_id": None,
            "depth": 0,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-2",
            "batch_id": "B2",
            "parent_material_id": "MAT-1",
            "parent_batch_id": "B1",
            "depth": 1,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-1",
            "batch_id": "B1",
            "parent_material_id": "MAT-2",
            "parent_batch_id": "B2",
            "depth": 2,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
    ]

    tree = _build_tree(rows)
    assert tree["name"] == "MAT-1"
    assert len(tree["children"]) == 1
    assert tree["children"][0]["name"] == "MAT-2"
    assert tree["children"][0]["children"] == []


def test_build_tree_prefers_lowest_depth_root_and_deduplicates():
    rows = [
        {
            "material_id": "MAT-ROOT",
            "batch_id": "B0",
            "parent_material_id": None,
            "parent_batch_id": None,
            "depth": 0,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-ROOT",
            "batch_id": "B0",
            "parent_material_id": None,
            "parent_batch_id": None,
            "depth": 2,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-CHILD",
            "batch_id": "B1",
            "parent_material_id": "MAT-ROOT",
            "parent_batch_id": "B0",
            "depth": 1,
            "release_status": "Blocked",
            "plant_name": "Plant B",
        },
    ]

    tree = _build_tree(rows)
    assert tree["name"] == "MAT-ROOT"
    assert tree["attributes"]["Depth"] == 0
    assert len(tree["children"]) == 1
    assert tree["children"][0]["name"] == "MAT-CHILD"


def test_build_tree_preserves_shared_nodes_under_multiple_parents():
    rows = [
        {
            "material_id": "MAT-ROOT",
            "batch_id": "B0",
            "parent_material_id": None,
            "parent_batch_id": None,
            "depth": 0,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-A",
            "batch_id": "B1",
            "parent_material_id": "MAT-ROOT",
            "parent_batch_id": "B0",
            "depth": 1,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-B",
            "batch_id": "B2",
            "parent_material_id": "MAT-ROOT",
            "parent_batch_id": "B0",
            "depth": 1,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-SHARED",
            "batch_id": "B3",
            "parent_material_id": "MAT-A",
            "parent_batch_id": "B1",
            "depth": 2,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
        {
            "material_id": "MAT-SHARED",
            "batch_id": "B3",
            "parent_material_id": "MAT-B",
            "parent_batch_id": "B2",
            "depth": 2,
            "release_status": "Released",
            "plant_name": "Plant A",
        },
    ]

    tree = _build_tree(rows)
    assert len(tree["children"]) == 2
    left_shared = tree["children"][0]["children"][0]
    right_shared = tree["children"][1]["children"][0]
    assert left_shared["name"] == "MAT-SHARED"
    assert right_shared["name"] == "MAT-SHARED"
    assert left_shared is not right_shared
