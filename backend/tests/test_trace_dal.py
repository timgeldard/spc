import pytest
import asyncio
from unittest.mock import AsyncMock
import backend.dal.trace_dal as trace_dal

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

    tree = trace_dal._build_tree(rows)
    assert tree["name"] == "MAT-1"
    assert len(tree["children"]) == 1
    assert tree["children"][0]["name"] == "MAT-2"
    assert tree["children"][0]["children"] == []

def test_build_tree_various_statuses():
    rows = [
        {"material_id": "M1", "batch_id": "B1", "release_status": "Released", "depth": 0},
        {"material_id": "M2", "batch_id": "B2", "release_status": "Blocked", "depth": 0},
        {"material_id": "M3", "batch_id": "B3", "release_status": "QI Hold", "depth": 0},
        {"material_id": "M4", "batch_id": "B4", "release_status": "Unknown", "depth": 0},
    ]
    # Check color/tier for each
    node1 = trace_dal._build_tree([rows[0]])
    assert node1["riskTier"] == "Pass"
    node2 = trace_dal._build_tree([rows[1]])
    assert node2["riskTier"] == "Critical"
    node3 = trace_dal._build_tree([rows[2]])
    assert node3["riskTier"] == "Warning"
    node4 = trace_dal._build_tree([rows[3]])
    assert node4["riskTier"] == "Unknown"

def test_build_tree_lowest_depth_wins():
    rows = [
        {"material_id": "M1", "batch_id": "B1", "release_status": "Released", "depth": 2},
        {"material_id": "M1", "batch_id": "B1", "release_status": "Released", "depth": 0},
    ]
    tree = trace_dal._build_tree(rows)
    assert tree["name"] == "M1"
    assert tree["attributes"]["Depth"] == 0

def test_build_tree_shared_node_deduplication():
    rows = [
        {"material_id": "M1", "batch_id": "B1", "release_status": "Released", "depth": 0},
        {"material_id": "M2", "batch_id": "B2", "parent_material_id": "M1", "parent_batch_id": "B1", "release_status": "Released", "depth": 1},
        {"material_id": "M3", "batch_id": "B3", "parent_material_id": "M1", "parent_batch_id": "B1", "release_status": "Released", "depth": 1},
        {"material_id": "M4", "batch_id": "B4", "parent_material_id": "M2", "parent_batch_id": "B2", "release_status": "Released", "depth": 2},
        {"material_id": "M4", "batch_id": "B4", "parent_material_id": "M3", "parent_batch_id": "B3", "release_status": "Released", "depth": 2},
    ]
    tree = trace_dal._build_tree(rows)
    m2 = next(c for c in tree["children"] if c["name"] == "M2")
    m3 = next(c for c in tree["children"] if c["name"] == "M3")
    assert len(m2["children"]) == 1
    assert len(m3["children"]) == 1
    assert m2["children"][0] == m3["children"][0]

async def test_fetch_trace_tree(monkeypatch):
    mock_run = AsyncMock(return_value=[{"material_id": "MAT1", "batch_id": "B1"}])
    monkeypatch.setattr(trace_dal, "run_sql_async", mock_run)
    
    res = await trace_dal.fetch_trace_tree("token", "MAT1", "B1")
    assert res[0]["material_id"] == "MAT1"
    assert mock_run.called

async def test_fetch_summary(monkeypatch):
    mock_run = AsyncMock(return_value=[{"total_produced": 100}])
    monkeypatch.setattr(trace_dal, "run_sql_async", mock_run)
    
    res = await trace_dal.fetch_summary("token", "B1")
    assert res["total_produced"] == 100
    
    mock_run.return_value = []
    res = await trace_dal.fetch_summary("token", "B2")
    assert res is None

async def test_fetch_batch_details(monkeypatch):
    mock_run = AsyncMock(return_value=[{"id": 1}])
    monkeypatch.setattr(trace_dal, "run_sql_async", mock_run)
    
    res = await trace_dal.fetch_batch_details("token", "MAT1", "B1")
    assert res["summary"]["id"] == 1
    assert len(res["coa_results"]) == 1

async def test_fetch_impact(monkeypatch):
    mock_run = AsyncMock(return_value=[{"customer_name": "Cust"}])
    monkeypatch.setattr(trace_dal, "run_sql_async", mock_run)
    
    res = await trace_dal.fetch_impact("token", "B1")
    assert res["customers"][0]["customer_name"] == "Cust"
