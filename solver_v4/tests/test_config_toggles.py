
import logging
from core.solver import SolverV4
from contracts.request import SolverRequest, SharedPreference, OperationDemand, PositionQualification, EmployeeProfile, CalendarDay, ShiftDefinition

# Configure logging to capture output
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TestConfig")

def create_mock_request(config=None):
    return SolverRequest(
        request_id="test_req_1",
        window={"start_date": "2026-01-01", "end_date": "2026-01-01"},
        operation_demands=[
             OperationDemand(
                operation_plan_id=101,
                batch_id=1,
                batch_code="B001",
                operation_id=1,
                operation_name="Op1",
                planned_start="2026-01-01 08:00",
                planned_end="2026-01-01 12:00",
                planned_duration_minutes=240,
                required_people=1,
                position_qualifications=[
                    PositionQualification(position_number=1, qualifications=[], candidate_employee_ids=[1])
                ]
            )
        ],
        employee_profiles=[
             EmployeeProfile(employee_id=1, employee_code="E1", employee_name="Emp1", qualifications=[], unavailable_periods=[])
        ],
        calendar=[CalendarDay(date="2026-01-01", is_workday=True, is_triple_salary=False)],
        shift_definitions=[],
        shared_preferences=[],
        config=config
    )

def test_toggles():
    solver = SolverV4()
    
    # 1. Test Share Group Disabled
    logger.info("\n--- Testing Share Group Disabled ---")
    req = create_mock_request(config={"enable_share_group": False})
    # Since we don't have share groups in mock req, we rely on logs
    # We expect to see "Skipping ShareGroupConstraint" in logs
    solver.solve(req)
    
    # 2. Test All Disabled
    logger.info("\n--- Testing All Disabled ---")
    req_all_disabled = create_mock_request(config={
        "enable_share_group": False,
        "enable_unique_employee": False,
        "enable_one_position": False,
        "enable_shift_assignment": False,
        "enable_max_consecutive_work_days": False,
        "enable_standard_hours": False,
        "enable_night_rest": False
    })
    solver.solve(req_all_disabled)
    
    logger.info("\n--- Verification Complete ---")

if __name__ == "__main__":
    test_toggles()
