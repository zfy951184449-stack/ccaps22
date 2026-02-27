"""
Verification Script for Employee Availability Constraint

Tests:
1. Basic exclusion: Unavailable employee should not be assigned
2. Partial overlap: Employee unavailable during part of operation should be excluded
3. No overlap: Available employee should be assigned
4. All unavailable: Should return INFEASIBLE
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.solver import SolverV4
from contracts.request import (
    SolverRequest, OperationDemand, PositionQualification, 
    EmployeeProfile, CalendarDay, ShiftDefinition
)


def create_test_request(
    op_start: str,
    op_end: str,
    emp_unavail_start: str = None,
    emp_unavail_end: str = None,
    num_employees: int = 2
):
    """Create a minimal test request"""
    
    employees = []
    for i in range(1, num_employees + 1):
        unavail = []
        if i == 1 and emp_unavail_start and emp_unavail_end:
            unavail = [{"start_datetime": emp_unavail_start, "end_datetime": emp_unavail_end}]
        
        employees.append(EmployeeProfile(
            employee_id=i,
            employee_code=f"E{i}",
            employee_name=f"Emp{i}",
            qualifications=[],
            unavailable_periods=unavail
        ))
    
    return SolverRequest(
        request_id="test_availability",
        window={"start_date": "2026-01-01", "end_date": "2026-01-01"},
        operation_demands=[
            OperationDemand(
                operation_plan_id=101,
                batch_id=1,
                batch_code="B001",
                operation_id=1,
                operation_name="TestOp",
                planned_start=op_start,
                planned_end=op_end,
                planned_duration_minutes=240,
                required_people=1,
                position_qualifications=[
                    PositionQualification(
                        position_number=1,
                        qualifications=[],
                        candidate_employee_ids=[e.employee_id for e in employees]
                    )
                ]
            )
        ],
        employee_profiles=employees,
        calendar=[CalendarDay(date="2026-01-01", is_workday=True, is_triple_salary=False)],
        shift_definitions=[],
        shared_preferences=[],
        config={}
    )


def test_basic_exclusion():
    """Test 1: Unavailable employee should not be assigned"""
    print("\n" + "="*60)
    print("TEST 1: Basic Exclusion")
    print("="*60)
    print("Op: 08:00-12:00, Emp1 unavail: 08:00-12:00 (exact match)")
    
    req = create_test_request(
        op_start="2026-01-01T08:00:00",
        op_end="2026-01-01T12:00:00",
        emp_unavail_start="2026-01-01T08:00:00",
        emp_unavail_end="2026-01-01T12:00:00"
    )
    
    solver = SolverV4()
    result = solver.solve(req)
    
    print(f"Status: {result['status']}")
    
    if result['status'] == 'FEASIBLE':
        assigned = result['assignments'][0]
        print(f"Assigned Employee: {assigned['employee_id']}")
        assert assigned['employee_id'] == 2, "Emp1 should be excluded!"
        print("✅ PASS: Emp1 (unavailable) excluded, Emp2 assigned")
    else:
        print("❌ FAIL: Expected FEASIBLE")
    
    return result['status'] == 'FEASIBLE'


def test_partial_overlap():
    """Test 2: Partial overlap should still exclude"""
    print("\n" + "="*60)
    print("TEST 2: Partial Overlap")
    print("="*60)
    print("Op: 08:00-12:00, Emp1 unavail: 10:00-14:00 (partial overlap)")
    
    req = create_test_request(
        op_start="2026-01-01T08:00:00",
        op_end="2026-01-01T12:00:00",
        emp_unavail_start="2026-01-01T10:00:00",
        emp_unavail_end="2026-01-01T14:00:00"
    )
    
    solver = SolverV4()
    result = solver.solve(req)
    
    print(f"Status: {result['status']}")
    
    if result['status'] == 'FEASIBLE':
        assigned = result['assignments'][0]
        print(f"Assigned Employee: {assigned['employee_id']}")
        assert assigned['employee_id'] == 2, "Emp1 should be excluded due to overlap!"
        print("✅ PASS: Partial overlap correctly excluded Emp1")
    else:
        print("❌ FAIL: Expected FEASIBLE")
    
    return result['status'] == 'FEASIBLE'


def test_no_overlap():
    """Test 3: No overlap - employee should be assignable"""
    print("\n" + "="*60)
    print("TEST 3: No Overlap")
    print("="*60)
    print("Op: 08:00-12:00, Emp1 unavail: 14:00-18:00 (no overlap)")
    
    req = create_test_request(
        op_start="2026-01-01T08:00:00",
        op_end="2026-01-01T12:00:00",
        emp_unavail_start="2026-01-01T14:00:00",
        emp_unavail_end="2026-01-01T18:00:00"
    )
    
    solver = SolverV4()
    result = solver.solve(req)
    
    print(f"Status: {result['status']}")
    
    if result['status'] == 'FEASIBLE':
        assigned = result['assignments'][0]
        print(f"Assigned Employee: {assigned['employee_id']}")
        # Either Emp1 or Emp2 is fine since both are available
        print("✅ PASS: Assignment successful (both employees available)")
    else:
        print("❌ FAIL: Expected FEASIBLE")
    
    return result['status'] == 'FEASIBLE'


def test_all_unavailable():
    """Test 4: All candidates unavailable should be INFEASIBLE"""
    print("\n" + "="*60)
    print("TEST 4: All Candidates Unavailable")
    print("="*60)
    print("Op: 08:00-12:00, Only Emp1 as candidate, Emp1 unavail: 08:00-12:00")
    
    # Create request with only 1 employee who is unavailable
    req = create_test_request(
        op_start="2026-01-01T08:00:00",
        op_end="2026-01-01T12:00:00",
        emp_unavail_start="2026-01-01T08:00:00",
        emp_unavail_end="2026-01-01T12:00:00",
        num_employees=1  # Only Emp1
    )
    
    solver = SolverV4()
    result = solver.solve(req)
    
    print(f"Status: {result['status']}")
    
    if result['status'] == 'INFEASIBLE':
        print("✅ PASS: Correctly returned INFEASIBLE")
    else:
        print("❌ FAIL: Expected INFEASIBLE")
    
    return result['status'] == 'INFEASIBLE'


if __name__ == "__main__":
    print("="*60)
    print("EMPLOYEE AVAILABILITY CONSTRAINT VERIFICATION")
    print("="*60)
    
    results = [
        ("Basic Exclusion", test_basic_exclusion()),
        ("Partial Overlap", test_partial_overlap()),
        ("No Overlap", test_no_overlap()),
        ("All Unavailable", test_all_unavailable()),
    ]
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed!")
    else:
        print("\n⚠️ Some tests failed!")
        sys.exit(1)
